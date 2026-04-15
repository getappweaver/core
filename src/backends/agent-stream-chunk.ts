// ---------------------------------------------------------------------------
// backends/agent-stream-chunk.ts — Normalized streaming chunks (web + SDK)
// ---------------------------------------------------------------------------

import { log } from '../logger';

export type AgentStreamChunk =
  | { kind: 'text_delta'; text: string }
  | { kind: 'status'; phase: 'started' | 'completed'; message: string | null }
  | { kind: 'error'; message: string };

export type OpencodeStreamLogState = {
  sessionId: string;
  warnOnceTypes: Set<string>;
};

export function createOpencodeStreamLogState(
  sessionId: string,
): OpencodeStreamLogState {
  return {
    sessionId,
    warnOnceTypes: new Set(),
  };
}

/**
 * Event types we drop with no log line — high-frequency or transport noise.
 * Intentionally ignored prefixes / session-scoped types are also silent;
 * only events that fall through to the bottom get logUnknownOnce (warn).
 */
const SILENT_STREAM_EVENT_TYPES = new Set<string>([
  'server.connected',
  'server.heartbeat',
]);

function previewPayload(value: unknown, maxLen: number): string {
  try {
    const s = JSON.stringify(value);

    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return String(value).slice(0, maxLen);
  }
}

function logUnknownOnce(
  logState: OpencodeStreamLogState,
  eventType: string,
  payload: unknown,
): void {
  const key = `${logState.sessionId}:${eventType}`;

  if (logState.warnOnceTypes.has(key)) {
    return;
  }

  logState.warnOnceTypes.add(key);

  log.warn(
    `opencode-sdk stream: unknown or malformed event "${eventType}" for session ${logState.sessionId}: ${previewPayload(payload, 240)}`,
  );
}

function extractSessionErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { message?: string } }).data;

    if (data && typeof data.message === 'string' && data.message.length > 0) {
      return data.message;
    }
  }

  return 'Session error';
}

/**
 * Map a single OpenCode `/event` SSE payload (SDK `Event` union shape) to a
 * normalized chunk, or `null` when the event should not be forwarded.
 */
export function mapOpencodeSsePayloadToChunk(
  raw: unknown,
  sessionId: string,
  logState: OpencodeStreamLogState,
): AgentStreamChunk | null {
  if (!raw || typeof raw !== 'object') {
    logUnknownOnce(logState, '(non-object)', raw);

    return null;
  }

  const rec = raw as Record<string, unknown>;
  const eventType = typeof rec.type === 'string' ? rec.type : '';
  const properties = rec.properties;

  if (!eventType) {
    logUnknownOnce(logState, '(missing-type)', raw);

    return null;
  }

  if (SILENT_STREAM_EVENT_TYPES.has(eventType)) {
    return null;
  }

  if (eventType === 'message.part.delta') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      return null;
    }

    if (typeof p.delta !== 'string' || p.delta.length === 0) {
      return null;
    }

    const field = typeof p.field === 'string' ? p.field : '';

    if (field === 'text') {
      return { kind: 'text_delta', text: p.delta };
    }

    return null;
  }

  if (eventType === 'session.status') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      return null;
    }

    const status = p.status;

    if (
      status &&
      typeof status === 'object' &&
      (status as { type?: string }).type === 'busy'
    ) {
      return {
        kind: 'status',
        phase: 'started',
        message: null,
      };
    }

    return null;
  }

  if (eventType === 'session.idle') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      return null;
    }

    return { kind: 'status', phase: 'completed', message: null };
  }

  if (eventType === 'session.error') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      return null;
    }

    const message = extractSessionErrorMessage(p.error);

    return { kind: 'error', message };
  }

  const ignoredPrefixes = [
    'tui.',
    'lsp.',
    'installation.',
    'project.',
    'server.',
    'global.',
    'file.',
    'vcs.',
    'mcp.',
    'pty.',
    'worktree.',
    'workspace.',
    'todo.',
    'question.',
    'permission.',
    'command.',
  ];

  for (const prefix of ignoredPrefixes) {
    if (eventType.startsWith(prefix)) {
      return null;
    }
  }

  const sessionScoped = [
    'session.diff',
    'session.compacted',
    'session.created',
    'session.updated',
    'session.deleted',
    'message.updated',
    'message.removed',
    'message.part.updated',
    'message.part.removed',
  ];

  if (sessionScoped.includes(eventType)) {
    if (
      properties &&
      typeof properties === 'object' &&
      typeof (properties as { sessionID?: string }).sessionID === 'string' &&
      (properties as { sessionID: string }).sessionID !== sessionId
    ) {
      return null;
    }

    return null;
  }

  logUnknownOnce(logState, eventType, raw);

  return null;
}
