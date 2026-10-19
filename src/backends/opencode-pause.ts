type PauseDecision = 'continue' | 'stop' | 'wait';

type PauseGate = {
  requested: boolean;
  paused: boolean;
  stopped: boolean;
  changed: () => void;
  waiters: Set<(action: PauseDecision) => void>;
};

const gates = new Map<string, PauseGate>();

export function registerPauseGate(
  sessionId: string,
  changed: () => void,
): void {
  gates.set(sessionId, {
    requested: false,
    paused: false,
    stopped: false,
    changed,
    waiters: new Set(),
  });
}

export function getPauseState(
  sessionId: string,
): 'working' | 'pausing' | 'paused' {
  const gate = gates.get(sessionId);

  return gate?.paused ? 'paused' : gate?.requested ? 'pausing' : 'working';
}

export function requestPause(sessionId: string): void {
  const gate = gates.get(sessionId);

  if (gate && !gate.stopped) {
    gate.requested = true;
    gate.changed();
  }
}

export function releasePause(sessionId: string, stop: boolean): void {
  const gate = gates.get(sessionId);

  if (!gate) {
    return;
  }

  gate.requested = false;
  gate.paused = false;
  gate.stopped = stop;
  for (const resolve of gate.waiters) {
    resolve(stop ? 'stop' : 'continue');
  }

  gate.waiters.clear();
  gate.changed();
}

export function unregisterPauseGate(sessionId: string): void {
  releasePause(sessionId, true);
  gates.delete(sessionId);
}

export async function awaitForegroundRequest(props: {
  sessionId: string;
  agent: string;
}): Promise<PauseDecision> {
  const gate = gates.get(props.sessionId);

  if (!gate || ['title', 'summary', 'compaction'].includes(props.agent)) {
    return 'continue';
  }

  if (gate.stopped) {
    return 'stop';
  }

  if (!gate.requested) {
    return 'continue';
  }

  return new Promise((resolve) => {
    const settle = (action: PauseDecision): void => {
      clearTimeout(timer);
      gate.waiters.delete(settle);
      resolve(action);
    };

    // Renew while paused rather than rely on an unbounded HTTP request.
    const timer = setTimeout(() => settle('wait'), 15_000);
    gate.waiters.add(settle);

    if (!gate.paused) {
      gate.paused = true;
      gate.changed();
    }
  });
}
