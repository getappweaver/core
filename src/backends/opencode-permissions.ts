import type {
  createOpencodeClient,
  PermissionRequest,
} from '@opencode-ai/sdk/v2';

import { debug, log } from '../logger';
import type { WebNodeRoot } from '../web/ui-schema';
import { multiChoiceQuestion } from '../web/widgets';

import { unwrapOpenCodeEventRecord } from './opencode-parts';

type PermissionClient = ReturnType<typeof createOpencodeClient>;
type PermissionReply = 'once' | 'always' | 'reject';

export type OpenCodePermissionPrompt = {
  requestId: string;
  prompt: WebNodeRoot;
};

type PendingPermission = {
  request: PermissionRequest;
  client: PermissionClient;
  cwd: string;
  owner: object;
  replying: boolean;
  onAnswered: () => void;
};

const pending = new Map<string, PendingPermission>();
const listeners = new Set<(sessionId: string) => void>();

function notify(sessionId: string): void {
  for (const listener of listeners) {
    try {
      listener(sessionId);
    } catch (error) {
      log.warn(`OpenCode permission notification failed: ${String(error)}`);
    }
  }
}

export function watchOpenCodePermissions(
  listener: (sessionId: string) => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function listOpenCodePermissionPrompts(
  sessionId: string,
): OpenCodePermissionPrompt[] {
  return [...pending.entries()]
    .filter(([, entry]) => entry.request.sessionID === sessionId)
    .map(([requestId, { request }]) => ({
      requestId,
      prompt: multiChoiceQuestion({
        command: 'agent',
        subcommand: 'permission',
        question:
          [...new Set([...request.patterns, ...request.always])].join('\n') ||
          request.permission,
        options: [
          { label: 'Allow once', value: 'once', tone: 'warning' },
          { label: 'Always allow', value: 'always' },
          { label: 'Reject', value: 'reject' },
        ],
      }),
    }));
}

export async function replyOpenCodePermission(
  requestId: string,
  answer: string,
): Promise<void> {
  if (answer !== 'once' && answer !== 'always' && answer !== 'reject') {
    throw new Error('Invalid OpenCode permission decision');
  }

  const entry = pending.get(requestId);

  if (!entry || entry.replying) {
    throw new Error(
      'OpenCode permission is no longer pending or is already being answered',
    );
  }

  entry.replying = true;
  try {
    // Keep the originating SDK client: model sources may use different servers.
    const result = await entry.client.permission.reply({
      requestID: entry.request.id,
      directory: entry.cwd,
      reply: answer satisfies PermissionReply,
    });

    if (result.error || result.data !== true) {
      throw new Error(
        `OpenCode permission reply failed: ${JSON.stringify(result.error ?? 'request was not accepted')}`,
      );
    }

    entry.onAnswered();

    if (pending.get(requestId) === entry) {
      pending.delete(requestId);
      notify(entry.request.sessionID);
    }
  } finally {
    entry.replying = false;
  }
}

type TrackOpenCodePermissionsProps = {
  client: PermissionClient;
  sessionId: string;
  cwd: string;
};

/** Recover pending requests after SSE reconnects, including non-streaming runs. */
export function trackOpenCodePermissions({
  client,
  sessionId,
  cwd,
}: TrackOpenCodePermissionsProps): {
  handleEvent: (event: unknown) => boolean;
  stop: () => void;
} {
  const owner = {};
  let stopped = false;
  let syncing = false;
  let eventVersion = 0;
  const answered = new Set<string>();

  const keyFor = (id: string): string =>
    `opencode-permission:${sessionId}:${id}`;

  const remember = (request: PermissionRequest): void => {
    const key = keyFor(request.id);

    if (stopped || answered.has(request.id) || pending.has(key)) {
      return;
    }

    pending.set(key, {
      request,
      client,
      cwd,
      owner,
      replying: false,
      onAnswered: () => {
        eventVersion += 1;
        answered.add(request.id);
      },
    });

    log.info(
      `OpenCode permission requested: ${request.permission} session=${sessionId}`,
    );

    notify(sessionId);
  };

  const forget = (id: string): void => {
    const key = keyFor(id);

    if (pending.get(key)?.owner !== owner) {
      return;
    }

    pending.delete(key);
    notify(sessionId);
  };

  const sync = async (): Promise<void> => {
    if (stopped || syncing) {
      return;
    }

    syncing = true;
    const version = eventVersion;
    try {
      const result = await client.permission.list({ directory: cwd });

      if (stopped || version !== eventVersion || result.error || !result.data) {
        return;
      }

      const requests = result.data.filter(
        (request) => request.sessionID === sessionId,
      );

      const ids = new Set(requests.map((request) => request.id));
      for (const entry of pending.values()) {
        if (entry.owner === owner && !ids.has(entry.request.id)) {
          forget(entry.request.id);
        }
      }

      for (const request of requests) {
        remember(request);
      }
    } catch (error) {
      debug('OpenCode pending permission recovery failed', String(error));
    } finally {
      syncing = false;
    }
  };

  const timer = setInterval(() => {
    void sync();
  }, 1000);

  timer.unref();
  void sync();

  return {
    handleEvent: (raw) => {
      const event = unwrapOpenCodeEventRecord(raw);

      if (
        event?.type !== 'permission.asked' &&
        event?.type !== 'permission.replied'
      ) {
        return false;
      }

      const properties = event.properties as
        Record<string, unknown> | undefined;

      if (properties?.sessionID !== sessionId) {
        return true;
      }

      eventVersion += 1;

      if (
        event.type === 'permission.replied' &&
        typeof properties.requestID === 'string'
      ) {
        answered.add(properties.requestID);
        forget(properties.requestID);
      } else if (event.type === 'permission.asked') {
        // The list endpoint is also authoritative recovery for malformed events.
        if (
          typeof properties.id === 'string' &&
          typeof properties.permission === 'string' &&
          Array.isArray(properties.patterns) &&
          properties.patterns.every((value) => typeof value === 'string') &&
          Array.isArray(properties.always) &&
          properties.always.every((value) => typeof value === 'string')
        ) {
          remember(properties as PermissionRequest);
        } else {
          void sync();
        }
      }

      return true;
    },
    stop: () => {
      stopped = true;
      clearInterval(timer);
      for (const entry of pending.values()) {
        if (entry.owner === owner) {
          forget(entry.request.id);
        }
      }
    },
  };
}
