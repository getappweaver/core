// ---------------------------------------------------------------------------
// backends/agent-stream-chunk.ts — Normalized streaming chunks (web + SDK)
// ---------------------------------------------------------------------------

import { debug, log } from '../logger';

import type { parseOpenCodePart } from './opencode-parts';
import {
  createOpenCodeParseState,
  parseOpenCodeUpdatedPart,
  rememberOpenCodeAssistantMessage,
  segmentSummary,
  type OpenCodeParseState,
} from './opencode-parts';

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
  | { kind: 'reasoning_delta'; text: string }
  | { kind: 'summary'; id: string; text: string }
  | { kind: 'diff'; files: AgentFileDiff[] }
  | { kind: 'tool'; tool: AgentToolCall }
  | { kind: 'status'; phase: 'started' | 'completed'; message: string | null }
  | { kind: 'error'; message: string };

export type OpencodeStreamLogState = {
  sessionId: string;
  warnOnceTypes: Set<string>;
  parseState: OpenCodeParseState;
};

export function createOpencodeStreamLogState(
  sessionId: string,
): OpencodeStreamLogState {
  return {
    sessionId,
    warnOnceTypes: new Set(),
    parseState: createOpenCodeParseState(),
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
  'sync',
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

function logIgnoredOnce(
  logState: OpencodeStreamLogState,
  eventType: string,
  reason: string,
  payload: unknown,
): void {
  const key = `${logState.sessionId}:ignored:${eventType}:${reason}`;

  if (logState.warnOnceTypes.has(key)) {
    return;
  }

  logState.warnOnceTypes.add(key);

  debug(
    `opencode-sdk stream: ignored event "${eventType}" (${reason}) for session ${logState.sessionId}`,
    previewPayload(payload, 240),
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

export function coerceFileDiff(value: unknown): AgentFileDiff | null {
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

function partType(properties: Record<string, unknown>): string | null {
  const part = properties.part;

  if (!part || typeof part !== 'object') {
    return null;
  }

  const type = (part as { type?: unknown }).type;

  return typeof type === 'string' ? type : null;
}

function rememberTextDelta(
  logState: OpencodeStreamLogState,
  properties: Record<string, unknown>,
  delta: string,
): void {
  const part = properties.part;

  const partRec =
    part && typeof part === 'object' ? (part as Record<string, unknown>) : null;

  const partId =
    (typeof properties.partID === 'string' && properties.partID) ||
    (typeof properties.partId === 'string' && properties.partId) ||
    (typeof partRec?.id === 'string' && partRec.id) ||
    null;

  if (partId) {
    const previousLength = logState.parseState.partTextLengths.get(partId) ?? 0;

    logState.parseState.partTextLengths.set(
      partId,
      previousLength + delta.length,
    );
  }
}

function segmentToChunk(
  segment: ReturnType<typeof parseOpenCodePart>,
): AgentStreamChunk | null {
  if (!segment) {
    return null;
  }

  switch (segment.kind) {
    case 'text':
      return { kind: 'text_delta', text: segment.text };
    case 'reasoning':
      return { kind: 'reasoning_delta', text: segment.text };
    case 'tool':
      debug('opencode-sdk stream: tool update', {
        tool: segment.tool.tool,
        status: segment.tool.status,
        callId: segment.tool.callId,
      });

      return { kind: 'tool', tool: segment.tool };
    case 'step_start':
      return { kind: 'status', phase: 'started', message: null };
    case 'step_finish':
      return { kind: 'status', phase: 'completed', message: null };
    case 'patch':
      return null;
    case 'file':
    case 'subtask':
    case 'agent':
    case 'retry':
    case 'compaction': {
      const text = segmentSummary(segment);

      return text ? { kind: 'summary', id: segment.partId, text } : null;
    }
  }
}

/**
 * Map a single OpenCode `/event` SSE payload (SDK `Event` union shape) to a
 * normalized chunk, or `null` when the event should not be forwarded.
 */
export function mapOpencodeSsePayloadToChunk(
  raw: unknown,
  sessionId: string,
  logState: OpencodeStreamLogState,
): AgentStreamChunk[] {
  if (!raw || typeof raw !== 'object') {
    logUnknownOnce(logState, '(non-object)', raw);

    return [];
  }

  const root = raw as Record<string, unknown>;

  const rec =
    root.payload && typeof root.payload === 'object'
      ? (root.payload as Record<string, unknown>)
      : root;

  const eventType = typeof rec.type === 'string' ? rec.type : '';
  const properties = rec.properties;

  if (!eventType) {
    logUnknownOnce(logState, '(missing-type)', raw);

    return [];
  }

  if (SILENT_STREAM_EVENT_TYPES.has(eventType)) {
    logIgnoredOnce(logState, eventType, 'silent transport event', raw);

    return [];
  }

  if (eventType === 'message.part.delta') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return [];
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return [];
    }

    if (typeof p.delta !== 'string' || p.delta.length === 0) {
      return [];
    }

    const field = typeof p.field === 'string' ? p.field : '';

    if (field === 'text' && partType(p) === 'reasoning') {
      rememberTextDelta(logState, p, p.delta);

      return [{ kind: 'reasoning_delta', text: p.delta }];
    }

    if (field === 'text') {
      rememberTextDelta(logState, p, p.delta);

      return [{ kind: 'text_delta', text: p.delta }];
    }

    if (field === 'reasoning') {
      rememberTextDelta(logState, p, p.delta);

      return [{ kind: 'reasoning_delta', text: p.delta }];
    }

    logIgnoredOnce(
      logState,
      eventType,
      `unsupported delta field ${field}`,
      raw,
    );

    return [];
  }

  if (eventType === 'session.status') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return [];
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return [];
    }

    const status = p.status;

    if (
      status &&
      typeof status === 'object' &&
      (status as { type?: string }).type === 'busy'
    ) {
      return [
        {
          kind: 'status',
          phase: 'started',
          message: null,
        },
      ];
    }

    logIgnoredOnce(logState, eventType, 'non-busy session status', raw);

    return [];
  }

  if (eventType === 'session.idle') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return [];
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return [];
    }

    return [{ kind: 'status', phase: 'completed', message: null }];
  }

  if (eventType === 'message.part.updated') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return [];
    }

    const p = properties as Record<string, unknown>;

    if (!isMatchingSession(p, sessionId)) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return [];
    }

    const segment = parseOpenCodeUpdatedPart(p.part, logState.parseState);
    const chunk = segmentToChunk(segment);

    if (chunk) {
      return [chunk];
    }

    const part =
      p.part && typeof p.part === 'object'
        ? (p.part as { type?: unknown })
        : null;

    logIgnoredOnce(
      logState,
      eventType,
      `unsupported part type ${typeof part?.type === 'string' ? part.type : ''}`,
      raw,
    );

    return [];
  }

  if (eventType === 'session.error') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return [];
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return [];
    }

    const message = extractSessionErrorMessage(p.error);

    return [{ kind: 'error', message }];
  }

  if (eventType === 'session.diff') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return [];
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return [];
    }

    if (!Array.isArray(p.diff)) {
      logUnknownOnce(logState, eventType, raw);

      return [];
    }

    const files = p.diff
      .map(coerceFileDiff)
      .filter((file): file is AgentFileDiff => file !== null);

    debug('opencode-sdk stream: session.diff', {
      sessionId,
      rawFiles: p.diff.length,
      files: files.length,
    });

    return files.length > 0 ? [{ kind: 'diff', files }] : [];
  }

  if (eventType === 'message.updated') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return [];
    }

    const p = properties as Record<string, unknown>;

    if (!isMatchingSession(p, sessionId)) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return [];
    }

    rememberOpenCodeAssistantMessage(p, logState.parseState);
    logIgnoredOnce(logState, eventType, 'message metadata update', raw);

    return [];
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
    'session.next.',
  ];

  for (const prefix of ignoredPrefixes) {
    if (eventType.startsWith(prefix)) {
      logIgnoredOnce(logState, eventType, `ignored prefix ${prefix}`, raw);

      return [];
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
      return [];
    }

    logIgnoredOnce(
      logState,
      eventType,
      'session-scoped event without stream chunk',
      raw,
    );

    return [];
  }

  logUnknownOnce(logState, eventType, raw);

  return [];
}
