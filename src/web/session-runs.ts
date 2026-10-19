import {
  getPauseState,
  registerPauseGate,
  releasePause,
  requestPause,
  unregisterPauseGate,
} from '@src/backends/opencode-pause';

type SessionRun = {
  requestId: string;
  kind: 'chat' | 'compact';
  abort: AbortController;
};

const runs = new Map<string, SessionRun>();

export type SessionRunView = {
  running: boolean;
  phase: 'idle' | 'working' | 'pausing' | 'paused' | 'stopping';
  queue: Array<{ id: string; content: string }>;
};

type QueuedChat = {
  id: string;
  content: string;
  run: (content: string) => Promise<void>;
  removed: () => void;
};

type SessionQueue = {
  items: QueuedChat[];
  held: boolean;
  urgent: string | null;
};

const queues = new Map<string, SessionQueue>();
const listeners = new Set<(sessionId: string) => void>();

function queueFor(sessionId: string): SessionQueue {
  let queue = queues.get(sessionId);

  if (!queue) {
    queue = { items: [], held: false, urgent: null };
    queues.set(sessionId, queue);
  }

  return queue;
}

export function getSessionRunView(sessionId: string): SessionRunView {
  const run = runs.get(sessionId);
  const queue = queues.get(sessionId);

  return {
    running: !!run,
    phase: run?.abort.signal.aborted
      ? 'stopping'
      : run
        ? getPauseState(sessionId)
        : queue?.held
          ? 'paused'
          : 'idle',
    queue: (queue?.items ?? []).map(({ id, content }) => ({ id, content })),
  };
}

function changed(sessionId: string): void {
  for (const listener of listeners) {
    listener(sessionId);
  }
}

export function watchSessionRuns(
  listener: (sessionId: string) => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function drain(sessionId: string): void {
  if (runs.has(sessionId)) {
    return;
  }

  const queue = queues.get(sessionId);

  if (!queue || (queue.held && !queue.urgent)) {
    return;
  }

  const index = queue.urgent
    ? queue.items.findIndex((item) => item.id === queue.urgent)
    : 0;

  const item = queue.items.splice(Math.max(index, 0), 1)[0];
  queue.urgent = null;

  if (!item) {
    if (!queue.held) {
      queues.delete(sessionId);
    }

    changed(sessionId);

    return;
  }

  // run() reserves the session synchronously before its first await.
  void item.run(item.content).catch(() => {
    queue.held = true;
    changed(sessionId);
  });
}

export function enqueueSessionChat(props: {
  sessionId: string;
  item: QueuedChat;
  pause: boolean;
}): void {
  const queue = queueFor(props.sessionId);

  if (queue.items.some((item) => item.id === props.item.id)) {
    throw new Error('Prompt already queued.');
  }

  queue.items.push(props.item);

  if (props.pause) {
    queue.held = true;
    requestPause(props.sessionId);
  }

  drain(props.sessionId);
  // An idle session starts immediately; do not publish its temporary queue
  // entry and flash the panel for an ordinary first prompt.
  changed(props.sessionId);
}

export function controlSessionQueue(props: {
  sessionId: string;
  action: 'pause' | 'continue' | 'dont_pause' | 'send_now' | 'edit' | 'remove';
  itemId: string | null;
  content: string | null;
}): void {
  const queue = queueFor(props.sessionId);

  if (props.action === 'pause') {
    queue.held = true;
    requestPause(props.sessionId);
  } else if (props.action === 'continue' || props.action === 'dont_pause') {
    if (runs.get(props.sessionId)?.abort.signal.aborted) {
      throw new Error('Wait for AI to stop.');
    }

    queue.held = false;
    releasePause(props.sessionId, false);
    drain(props.sessionId);
  } else {
    const index = queue.items.findIndex((item) => item.id === props.itemId);
    const item = queue.items[index];

    if (!item) {
      throw new Error('Queued prompt no longer exists.');
    }

    if (queue.urgent) {
      throw new Error('Wait for Send now to finish stopping AI.');
    }

    if (props.action === 'edit') {
      if (!props.content?.trim()) {
        throw new Error('Prompt cannot be empty.');
      }

      item.content = props.content.trim();
    } else if (props.action === 'remove') {
      queue.items.splice(index, 1);
      item.removed();
    } else {
      stopSessionRun(props.sessionId);
      queue.urgent = item.id;
      // Keep other items held until the user chooses Continue.
      queue.held = queue.items.length > 1;
      drain(props.sessionId);
    }
  }

  changed(props.sessionId);
}

export function isSessionRunning(sessionId: string): boolean {
  return runs.has(sessionId);
}

export function startSessionRun(
  sessionId: string,
  requestId: string,
  kind: SessionRun['kind'],
): AbortController {
  if (runs.has(sessionId)) {
    throw new Error(
      'This session is already running. Stop it before starting another operation.',
    );
  }

  const abort = new AbortController();
  runs.set(sessionId, { requestId, kind, abort });
  registerPauseGate(sessionId, () => changed(sessionId));
  changed(sessionId);

  return abort;
}

export function stopSessionRun(sessionId: string): boolean {
  const queue = queueFor(sessionId);
  queue.held = true;
  queue.urgent = null;
  const run = runs.get(sessionId);

  if (!run) {
    changed(sessionId);

    return false;
  }

  run.abort.abort();
  releasePause(sessionId, true);
  changed(sessionId);

  return true;
}

export function finishSessionRun(sessionId: string, requestId: string): void {
  if (runs.get(sessionId)?.requestId === requestId) {
    unregisterPauseGate(sessionId);
    runs.delete(sessionId);
    changed(sessionId);
    drain(sessionId);
  }
}
