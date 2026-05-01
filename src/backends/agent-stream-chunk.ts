// ---------------------------------------------------------------------------
// backends/agent-stream-chunk.ts — Normalized streaming chunks (web + SDK)
// ---------------------------------------------------------------------------

import { log } from '../logger';

export type AgentFileDiff = {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status: 'added' | 'deleted' | 'modified' | null;
};

export type AgentToolCall = {
  id: string;
  callId: string;
  tool: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  input: Record<string, unknown>;
  title: string | null;
  raw: string | null;
  output: string | null;
  error: string | null;
};

export type AgentStreamChunk =
  | { kind: 'text_delta'; text: string }
  | { kind: 'diff'; files: AgentFileDiff[] }
  | { kind: 'tool'; tool: AgentToolCall }
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

function coerceFileDiff(value: unknown): AgentFileDiff | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const rec = value as Record<string, unknown>;

  if (typeof rec.file !== 'string' || typeof rec.patch !== 'string') {
    return null;
  }

  const status =
    rec.status === 'added' ||
    rec.status === 'deleted' ||
    rec.status === 'modified'
      ? rec.status
      : null;

  return {
    file: rec.file,
    patch: rec.patch,
    additions: typeof rec.additions === 'number' ? rec.additions : 0,
    deletions: typeof rec.deletions === 'number' ? rec.deletions : 0,
    status,
  };
}

function coerceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function coerceToolCall(value: unknown): AgentToolCall | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const part = value as Record<string, unknown>;

  if (
    part.type !== 'tool' ||
    typeof part.id !== 'string' ||
    typeof part.callID !== 'string' ||
    typeof part.tool !== 'string'
  ) {
    return null;
  }

  const state = coerceRecord(part.state);
  const status = state.status;

  if (
    status !== 'pending' &&
    status !== 'running' &&
    status !== 'completed' &&
    status !== 'error'
  ) {
    return null;
  }

  return {
    id: part.id,
    callId: part.callID,
    tool: part.tool,
    status,
    input: coerceRecord(state.input),
    title: typeof state.title === 'string' ? state.title : null,
    raw: typeof state.raw === 'string' ? state.raw : null,
    output: typeof state.output === 'string' ? state.output : null,
    error: typeof state.error === 'string' ? state.error : null,
  };
}

function isMatchingSession(
  properties: Record<string, unknown>,
  sessionId: string,
): boolean {
  const directSessionId = properties.sessionID;

  if (typeof directSessionId === 'string') {
    return directSessionId === sessionId;
  }

  const part = properties.part;

  if (part && typeof part === 'object') {
    const partSessionId = (part as { sessionID?: unknown }).sessionID;

    if (typeof partSessionId === 'string') {
      return partSessionId === sessionId;
    }
  }

  return true;
}

function getPartType(properties: Record<string, unknown>): string {
  const directType = properties.type;

  if (typeof directType === 'string') {
    return directType;
  }

  const part = properties.part;

  if (part && typeof part === 'object') {
    const partType = (part as { type?: unknown }).type;

    if (typeof partType === 'string') {
      return partType;
    }
  }

  return '';
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

  if (eventType === 'message.part.updated') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (!isMatchingSession(p, sessionId)) {
      return null;
    }

    const partType = getPartType(p);

    if (partType === 'tool') {
      const tool = coerceToolCall(p.part);

      if (!tool) {
        logUnknownOnce(logState, eventType, raw);

        return null;
      }

      return { kind: 'tool', tool };
    }

    if (
      partType === 'step-finish' ||
      partType === 'step_finish' ||
      partType === 'step.finish'
    ) {
      return { kind: 'status', phase: 'completed', message: null };
    }

    return null;
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

  if (eventType === 'session.diff') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      return null;
    }

    if (!Array.isArray(p.diff)) {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const files = p.diff
      .map(coerceFileDiff)
      .filter((file): file is AgentFileDiff => file !== null);

    return files.length > 0 ? { kind: 'diff', files } : null;
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
    'session.compacted',
    'session.created',
    'session.updated',
    'session.deleted',
    'message.updated',
    'message.removed',
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
