// ---------------------------------------------------------------------------
// backends/agent-stream-chunk.ts — Normalized streaming chunks (web + SDK)
// ---------------------------------------------------------------------------

import { debug, log } from '../logger';

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
  assistantMessageIds: Set<string>;
  partTextLengths: Map<string, number>;
  emittedTextDeltas: Set<string>;
};

const DIFF_CONTEXT_LINES = 3;
const MAX_COMPACT_DIFF_LINES = 360;

export function createOpencodeStreamLogState(
  sessionId: string,
): OpencodeStreamLogState {
  return {
    sessionId,
    warnOnceTypes: new Set(),
    assistantMessageIds: new Set(),
    partTextLengths: new Map(),
    emittedTextDeltas: new Set(),
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

function isDiffChangedLine(line: string): boolean {
  return (
    (line.startsWith('+') && !line.startsWith('+++')) ||
    (line.startsWith('-') && !line.startsWith('---'))
  );
}

type DiffLinePosition = {
  oldLine: number;
  newLine: number;
} | null;

function parseHunkStart(line: string): DiffLinePosition {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

  if (!match) {
    return null;
  }

  return {
    oldLine: Number(match[1]),
    newLine: Number(match[2]),
  };
}

function diffLinePositions(lines: string[]): DiffLinePosition[] {
  const positions: DiffLinePosition[] = [];
  let oldLine: number | null = null;
  let newLine: number | null = null;

  for (const line of lines) {
    const hunkStart = parseHunkStart(line);

    if (hunkStart) {
      oldLine = hunkStart.oldLine;
      newLine = hunkStart.newLine;
      positions.push(null);
      continue;
    }

    if (oldLine === null || newLine === null) {
      positions.push(null);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      positions.push({ oldLine, newLine });
      newLine += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      positions.push({ oldLine, newLine });
      oldLine += 1;
      continue;
    }

    positions.push({ oldLine, newLine });
    oldLine += 1;
    newLine += 1;
  }

  return positions;
}

function compactPatchAroundChanges(patch: string): string {
  const lines = patch.split('\n');
  const positions = diffLinePositions(lines);
  const keep = new Set<number>();
  let hasChangedLine = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    if (
      line.startsWith('diff --git ') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      keep.add(i);
      continue;
    }

    if (line.startsWith('@@')) {
      keep.add(i);
    }

    if (!isDiffChangedLine(line)) {
      continue;
    }

    hasChangedLine = true;

    for (
      let j = Math.max(0, i - DIFF_CONTEXT_LINES);
      j <= Math.min(lines.length - 1, i + DIFF_CONTEXT_LINES);
      j += 1
    ) {
      keep.add(j);
    }

    for (let j = i; j >= 0; j -= 1) {
      if (lines[j]?.startsWith('@@')) {
        keep.add(j);
        break;
      }
    }
  }

  if (!hasChangedLine) {
    return lines.length <= MAX_COMPACT_DIFF_LINES
      ? patch
      : lines.slice(0, MAX_COMPACT_DIFF_LINES).join('\n');
  }

  const compacted: string[] = [];
  let previousKept = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (!keep.has(i)) {
      continue;
    }

    if (previousKept >= 0 && i > previousKept + 1) {
      const position = positions[i];

      compacted.push(
        position ? `⋮ @@ -${position.oldLine} +${position.newLine} @@` : '⋮',
      );
    }

    compacted.push(lines[i] ?? '');
    previousKept = i;
  }

  return compacted.join('\n');
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
    patch: compactPatchAroundChanges(rec.patch),
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

function rememberAssistantMessage(
  properties: Record<string, unknown>,
  logState: OpencodeStreamLogState,
): void {
  const info = properties.info;

  if (!info || typeof info !== 'object') {
    return;
  }

  const message = info as Record<string, unknown>;

  if (message.role !== 'assistant' || typeof message.id !== 'string') {
    return;
  }

  logState.assistantMessageIds.add(message.id);
}

function textDeltaFromUpdatedPart(
  part: Record<string, unknown>,
  logState: OpencodeStreamLogState,
): string | null {
  const partId = typeof part.id === 'string' ? part.id : null;
  const messageId = typeof part.messageID === 'string' ? part.messageID : null;
  const text = typeof part.text === 'string' ? part.text : null;

  if (!partId || !messageId || text === null) {
    return null;
  }

  if (!logState.assistantMessageIds.has(messageId)) {
    return null;
  }

  const previousLength = logState.partTextLengths.get(partId) ?? 0;

  if (text.length <= previousLength) {
    return null;
  }

  logState.partTextLengths.set(partId, text.length);

  const delta = text.slice(previousLength);
  const partType = typeof part.type === 'string' ? part.type : 'text';
  const emittedKey = `${messageId}:${partType}:${delta}`;

  if (logState.emittedTextDeltas.has(emittedKey)) {
    return null;
  }

  logState.emittedTextDeltas.add(emittedKey);

  return delta;
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

  const root = raw as Record<string, unknown>;

  const rec =
    root.payload && typeof root.payload === 'object'
      ? (root.payload as Record<string, unknown>)
      : root;

  const eventType = typeof rec.type === 'string' ? rec.type : '';
  const properties = rec.properties;

  if (!eventType) {
    logUnknownOnce(logState, '(missing-type)', raw);

    return null;
  }

  if (SILENT_STREAM_EVENT_TYPES.has(eventType)) {
    logIgnoredOnce(logState, eventType, 'silent transport event', raw);

    return null;
  }

  if (eventType === 'message.part.delta') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return null;
    }

    if (typeof p.delta !== 'string' || p.delta.length === 0) {
      return null;
    }

    const field = typeof p.field === 'string' ? p.field : '';

    if (field === 'text') {
      return { kind: 'text_delta', text: p.delta };
    }

    if (field === 'reasoning' || field === 'thinking') {
      return { kind: 'text_delta', text: p.delta };
    }

    logIgnoredOnce(
      logState,
      eventType,
      `unsupported delta field ${field}`,
      raw,
    );

    return null;
  }

  if (eventType === 'session.status') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

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

    logIgnoredOnce(logState, eventType, 'non-busy session status', raw);

    return null;
  }

  if (eventType === 'session.idle') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

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
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return null;
    }

    const partType = getPartType(p);

    const part =
      p.part && typeof p.part === 'object'
        ? (p.part as Record<string, unknown>)
        : null;

    if (part && (partType === 'text' || partType === 'reasoning')) {
      const delta = textDeltaFromUpdatedPart(part, logState);

      return delta ? { kind: 'text_delta', text: delta } : null;
    }

    if (partType === 'tool') {
      const tool = coerceToolCall(p.part);

      if (!tool) {
        logUnknownOnce(logState, eventType, raw);

        return null;
      }

      debug('opencode-sdk stream: tool update', {
        sessionId,
        tool: tool.tool,
        status: tool.status,
        callId: tool.callId,
      });

      return { kind: 'tool', tool };
    }

    if (
      partType === 'step-finish' ||
      partType === 'step_finish' ||
      partType === 'step.finish'
    ) {
      return { kind: 'status', phase: 'completed', message: null };
    }

    logIgnoredOnce(
      logState,
      eventType,
      `unsupported part type ${partType}`,
      raw,
    );

    return null;
  }

  if (eventType === 'session.error') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (typeof p.sessionID !== 'string' || p.sessionID !== sessionId) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

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
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return null;
    }

    if (!Array.isArray(p.diff)) {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const files = p.diff
      .map(coerceFileDiff)
      .filter((file): file is AgentFileDiff => file !== null);

    debug('opencode-sdk stream: session.diff', {
      sessionId,
      rawFiles: p.diff.length,
      files: files.length,
    });

    return files.length > 0 ? { kind: 'diff', files } : null;
  }

  if (eventType === 'message.updated') {
    if (!properties || typeof properties !== 'object') {
      logUnknownOnce(logState, eventType, raw);

      return null;
    }

    const p = properties as Record<string, unknown>;

    if (!isMatchingSession(p, sessionId)) {
      logIgnoredOnce(logState, eventType, 'different session', raw);

      return null;
    }

    rememberAssistantMessage(p, logState);
    logIgnoredOnce(logState, eventType, 'message metadata update', raw);

    return null;
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

    logIgnoredOnce(
      logState,
      eventType,
      'session-scoped event without stream chunk',
      raw,
    );

    return null;
  }

  logUnknownOnce(logState, eventType, raw);

  return null;
}
