import type { AgentToolCall } from './agent-stream-chunk';
import type { OutputSegment } from './types';

export type OpenCodeParsedSegment =
  | {
      kind: 'text';
      partId: string;
      messageId: string;
      text: string;
    }
  | {
      kind: 'reasoning';
      partId: string;
      messageId: string;
      text: string;
    }
  | {
      kind: 'tool';
      partId: string;
      messageId: string;
      tool: AgentToolCall;
    }
  | {
      kind: 'patch';
      partId: string;
      messageId: string;
      hash: string;
      files: string[];
    }
  | {
      kind: 'step_start';
      partId: string;
      messageId: string;
      snapshot: string | null;
    }
  | {
      kind: 'step_finish';
      partId: string;
      messageId: string;
      reason: string;
      cost: number;
      tokens: Record<string, unknown>;
    }
  | {
      kind: 'file';
      partId: string;
      messageId: string;
      filename: string | null;
      mime: string;
      url: string;
    }
  | {
      kind: 'subtask';
      partId: string;
      messageId: string;
      prompt: string;
      description: string;
      agent: string;
    }
  | {
      kind: 'agent';
      partId: string;
      messageId: string;
      name: string;
    }
  | {
      kind: 'retry';
      partId: string;
      messageId: string;
      attempt: number;
      error: string;
    }
  | {
      kind: 'compaction';
      partId: string;
      messageId: string;
      auto: boolean;
      overflow: boolean | null;
    };

export type OpenCodeParseState = {
  assistantMessageIds: Set<string>;
  partTextLengths: Map<string, number>;
  emittedDedupeKeys: Set<string>;
};

export function createOpenCodeParseState(): OpenCodeParseState {
  return {
    assistantMessageIds: new Set(),
    partTextLengths: new Map(),
    emittedDedupeKeys: new Set(),
  };
}

export function unwrapOpenCodeEventRecord(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const root = raw as Record<string, unknown>;

  return root.payload && typeof root.payload === 'object'
    ? (root.payload as Record<string, unknown>)
    : root;
}

export function isOpenCodeSessionCompletionEvent(
  raw: unknown,
  sessionId: string,
): boolean {
  const rec = unwrapOpenCodeEventRecord(raw);

  if (!rec) {
    return false;
  }

  const properties = rec.properties;

  if (!properties || typeof properties !== 'object') {
    return false;
  }

  const p = properties as Record<string, unknown>;

  return rec.type === 'session.idle' && p.sessionID === sessionId;
}

function coerceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function commonPartFields(
  part: Record<string, unknown>,
): { partId: string; messageId: string } | null {
  return typeof part.id === 'string' && typeof part.messageID === 'string'
    ? { partId: part.id, messageId: part.messageID }
    : null;
}

function coerceToolCall(part: Record<string, unknown>): AgentToolCall | null {
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

function stringifyError(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message;

    if (typeof message === 'string') {
      return message;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export function parseOpenCodePart(
  value: unknown,
): OpenCodeParsedSegment | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const part = value as Record<string, unknown>;
  const common = commonPartFields(part);
  const type = part.type;

  if (!common || typeof type !== 'string') {
    return null;
  }

  switch (type) {
    case 'text':
      return typeof part.text === 'string'
        ? { kind: 'text', ...common, text: part.text }
        : null;
    case 'reasoning':
      return typeof part.text === 'string'
        ? { kind: 'reasoning', ...common, text: part.text }
        : null;
    case 'tool': {
      const tool = coerceToolCall(part);

      return tool ? { kind: 'tool', ...common, tool } : null;
    }

    case 'patch':
      return typeof part.hash === 'string' && Array.isArray(part.files)
        ? {
            kind: 'patch',
            ...common,
            hash: part.hash,
            files: part.files.filter(
              (file): file is string => typeof file === 'string',
            ),
          }
        : null;
    case 'step-start':
      return {
        kind: 'step_start',
        ...common,
        snapshot: typeof part.snapshot === 'string' ? part.snapshot : null,
      };
    case 'step-finish':
      return {
        kind: 'step_finish',
        ...common,
        reason: typeof part.reason === 'string' ? part.reason : '',
        cost: typeof part.cost === 'number' ? part.cost : 0,
        tokens: coerceRecord(part.tokens),
      };
    case 'file':
      return typeof part.mime === 'string' && typeof part.url === 'string'
        ? {
            kind: 'file',
            ...common,
            filename: typeof part.filename === 'string' ? part.filename : null,
            mime: part.mime,
            url: part.url,
          }
        : null;
    case 'subtask':
      return typeof part.prompt === 'string' &&
        typeof part.description === 'string' &&
        typeof part.agent === 'string'
        ? {
            kind: 'subtask',
            ...common,
            prompt: part.prompt,
            description: part.description,
            agent: part.agent,
          }
        : null;
    case 'agent':
      return typeof part.name === 'string'
        ? { kind: 'agent', ...common, name: part.name }
        : null;
    case 'retry':
      return typeof part.attempt === 'number'
        ? {
            kind: 'retry',
            ...common,
            attempt: part.attempt,
            error: stringifyError(part.error),
          }
        : null;
    case 'compaction':
      return typeof part.auto === 'boolean'
        ? {
            kind: 'compaction',
            ...common,
            auto: part.auto,
            overflow: typeof part.overflow === 'boolean' ? part.overflow : null,
          }
        : null;
    default:
      return null;
  }
}

export function parseOpenCodeMessage(value: unknown): OpenCodeParsedSegment[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const rec = value as Record<string, unknown>;
  const parts = rec.parts;

  return Array.isArray(parts)
    ? parts
        .map(parseOpenCodePart)
        .filter((segment): segment is OpenCodeParsedSegment => segment !== null)
    : [];
}

export function rememberOpenCodeAssistantMessage(
  properties: Record<string, unknown>,
  state: OpenCodeParseState,
): void {
  const info = properties.info;

  if (!info || typeof info !== 'object') {
    return;
  }

  const message = info as Record<string, unknown>;

  if (message.role !== 'assistant' || typeof message.id !== 'string') {
    return;
  }

  state.assistantMessageIds.add(message.id);
}

function deltaForTextSegment(
  segment: Extract<OpenCodeParsedSegment, { kind: 'text' | 'reasoning' }>,
  state: OpenCodeParseState,
): OpenCodeParsedSegment | null {
  if (!state.assistantMessageIds.has(segment.messageId)) {
    return null;
  }

  const previousLength = state.partTextLengths.get(segment.partId) ?? 0;

  if (segment.text.length <= previousLength) {
    return null;
  }

  state.partTextLengths.set(segment.partId, segment.text.length);

  const text = segment.text.slice(previousLength);
  const dedupeKey = `${segment.messageId}:${segment.kind}:${text}`;

  if (state.emittedDedupeKeys.has(dedupeKey)) {
    return null;
  }

  state.emittedDedupeKeys.add(dedupeKey);

  return { ...segment, text };
}

export function parseOpenCodeUpdatedPart(
  part: unknown,
  state: OpenCodeParseState,
): OpenCodeParsedSegment | null {
  const segment = parseOpenCodePart(part);

  if (!segment) {
    return null;
  }

  if (segment.kind === 'text' || segment.kind === 'reasoning') {
    return deltaForTextSegment(segment, state);
  }

  return segment;
}

export function segmentsToOutputs(
  segments: OpenCodeParsedSegment[],
): OutputSegment[] {
  const outputs = segments.flatMap((segment): OutputSegment[] => {
    if (segment.kind === 'text' && segment.text.length > 0) {
      return [{ type: 'text', value: segment.text }];
    }

    if (segment.kind === 'reasoning' && segment.text.length > 0) {
      return [{ type: 'reasoning', value: segment.text }];
    }

    return [];
  });

  return outputs.length > 0
    ? outputs
    : [{ type: 'text', value: '(no output)' }];
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function segmentSummary(segment: OpenCodeParsedSegment): string | null {
  switch (segment.kind) {
    case 'file':
      return `→ File ${segment.filename ?? segment.url} [mime=${segment.mime}]`;
    case 'subtask':
      return `→ Subtask ${segment.agent}: ${shorten(segment.description, 96)}`;
    case 'agent':
      return `→ Agent ${segment.name}`;
    case 'retry':
      return `↻ Retry attempt ${segment.attempt}: ${shorten(segment.error, 96)}`;
    case 'compaction':
      return segment.overflow
        ? '↧ Compacted context [overflow]'
        : '↧ Compacted context';
    default:
      return null;
  }
}
