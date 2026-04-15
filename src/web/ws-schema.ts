import { z, ZodError } from 'zod';

import type { AgentStreamChunk } from '@src/backends/agent-stream-chunk';
import type { PromptPayload } from '@src/core/plugin';
import type { TimelineHistoryItem } from '@src/timeline/types';
import type { WebCommandListItem } from '@src/web/command-catalog';
import type { WebNodeRoot } from '@src/web/ui-schema';
import { WebOptionFieldHintValueSchema } from '@src/web/ui-schema';

const RequestIdSchema = z.string().min(1);

const CommandPayloadSchema = z.object({
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

const WebHeaderWidgetSchema = z.object({
  label: z.string().min(1),
  modalTitle: z.string().min(1),
});

/** First message when the HTTP upgrade did not include `Authorization: Nostr …` (browser WebSockets). */
export const AuthenticateClientMessageSchema = z.object({
  type: z.literal('authenticate'),
  requestId: RequestIdSchema,
  /** Full HTTP-style value, e.g. `Nostr <base64 kind-27235 event>`. */
  authorization: z.string().min(1),
});

export const RequestCommandsClientMessageSchema = z.object({
  type: z.literal('request_commands'),
  requestId: RequestIdSchema,
});

export const LoadTimelineClientMessageSchema = z.object({
  type: z.literal('load_timeline'),
  requestId: RequestIdSchema,
  timelineId: z.string().min(1),
  limit: z.number().int().positive().max(200).optional().default(100),
});

export const LoadTimelineBeforeClientMessageSchema = z.object({
  type: z.literal('load_timeline_before'),
  requestId: RequestIdSchema,
  timelineId: z.string().min(1),
  beforeCreatedAt: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(200).optional().default(100),
});

export const RunCommandClientMessageSchema = z.object({
  type: z.literal('run_command'),
  requestId: RequestIdSchema,
  timelineId: z.string().min(1),
  command: z.string().min(1),
  subcommand: z.string().min(1),
  payload: CommandPayloadSchema.optional().default({
    arguments: {},
    options: {},
  }),
  /** When false, no timeline rows for this command session (invocation, results, prompts, prompt answers). */
  recordInTimeline: z.boolean().optional().default(true),
});

export const PromptAnswerClientMessageSchema = z.object({
  type: z.literal('prompt_answer'),
  requestId: RequestIdSchema,
  answer: z.string(),
});

export const ChatClientMessageSchema = z.object({
  type: z.literal('chat'),
  requestId: RequestIdSchema,
  timelineId: z.string().min(1),
  content: z.string().min(1),
});

export const SaveTimelineFormClientMessageSchema = z.object({
  type: z.literal('save_timeline_form'),
  requestId: RequestIdSchema,
  timelineId: z.string().min(1),
  eventId: z.string().min(1),
  command: z.string().min(1),
  form: z.object({
    subcommand: z.object({
      name: z.string().min(1),
      summary: z.string(),
      usage: z.string(),
      aliases: z.array(z.string()),
      arguments: z.array(
        z.object({
          name: z.string().min(1),
          summary: z.string(),
          kind: z.enum(['string', 'integer', 'boolean']),
          webDefaultValue: z
            .union([z.string(), z.number(), z.boolean()])
            .optional(),
          required: z.boolean().optional(),
          variadic: z.boolean().optional(),
          flag: z.string().optional(),
          shortFlag: z.string().nullable().optional(),
          choices: z.array(z.string()).optional(),
        }),
      ),
      options: z.array(
        z.object({
          name: z.string().min(1),
          summary: z.string(),
          kind: z.enum(['string', 'integer', 'boolean']),
          webDefaultValue: z
            .union([z.string(), z.number(), z.boolean()])
            .optional(),
          required: z.boolean().optional(),
          variadic: z.boolean().optional(),
          flag: z.string().optional(),
          shortFlag: z.string().nullable().optional(),
          choices: z.array(z.string()).optional(),
        }),
      ),
      examples: z.array(z.string()),
      inferredWeb: z
        .object({
          executionMode: z.enum([
            'requires_input',
            'runnable_default',
            'runnable_customizable',
          ]),
        })
        .optional(),
      webHeaderWidget: WebHeaderWidgetSchema.optional(),
    }),
    values: CommandPayloadSchema,
    autoRun: z.boolean(),
    optionHints: z.record(z.string(), WebOptionFieldHintValueSchema).optional(),
  }),
});

export const DeleteTimelineEventClientMessageSchema = z.object({
  type: z.literal('delete_timeline_event'),
  requestId: RequestIdSchema,
  timelineId: z.string().min(1),
  eventId: z.string().min(1),
});

export const WebSocketClientMessageSchema = z.discriminatedUnion('type', [
  AuthenticateClientMessageSchema,
  RequestCommandsClientMessageSchema,
  LoadTimelineClientMessageSchema,
  LoadTimelineBeforeClientMessageSchema,
  RunCommandClientMessageSchema,
  PromptAnswerClientMessageSchema,
  ChatClientMessageSchema,
  SaveTimelineFormClientMessageSchema,
  DeleteTimelineEventClientMessageSchema,
]);

function summarizeWebSocketPayloadTypeField(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return 'payload is null or undefined';
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return `payload is ${typeof payload}`;
  }

  if (!('type' in payload)) {
    return 'no "type" field';
  }

  const raw = (payload as { type: unknown }).type;

  if (raw === undefined) {
    return '"type" is undefined';
  }

  if (typeof raw !== 'string') {
    return `"type" is ${typeof raw}`;
  }

  if (raw.length === 0) {
    return '"type" is empty string';
  }

  return JSON.stringify(raw);
}

type FormatWebSocketClientParseFailureProps = {
  payload: unknown;
  error: unknown;
};

/**
 * Zod v4 sets `ZodError.message` to JSON.stringify(issues), which is noisy in the web UI.
 * Map common failures to short copy; keep a compact hint for other schema errors.
 */
export function formatWebSocketClientParseFailure({
  payload,
  error,
}: FormatWebSocketClientParseFailureProps): string {
  const typeDesc = summarizeWebSocketPayloadTypeField(payload);

  if (error instanceof ZodError) {
    const issue0 = error.issues[0];

    if (
      issue0 &&
      issue0.code === 'invalid_union' &&
      'note' in issue0 &&
      issue0.note === 'No matching discriminator'
    ) {
      return `Unknown WebSocket message type (${typeDesc}). If you updated the web UI, restart dm-bot so the server matches the client.`;
    }

    const detail = error.issues
      .map((issue) => issue.message)
      .filter((m) => m.length > 0)
      .join('; ');

    return detail.length > 0
      ? `Invalid WebSocket message (${typeDesc}): ${detail}`
      : `Invalid WebSocket message (${typeDesc}).`;
  }

  return error instanceof Error ? error.message : String(error);
}

export type AuthenticateClientMessage = z.infer<
  typeof AuthenticateClientMessageSchema
>;
export type RequestCommandsClientMessage = z.infer<
  typeof RequestCommandsClientMessageSchema
>;
export type RunCommandClientMessage = z.infer<
  typeof RunCommandClientMessageSchema
>;
export type LoadTimelineClientMessage = z.infer<
  typeof LoadTimelineClientMessageSchema
>;
export type LoadTimelineBeforeClientMessage = z.infer<
  typeof LoadTimelineBeforeClientMessageSchema
>;
export type PromptAnswerClientMessage = z.infer<
  typeof PromptAnswerClientMessageSchema
>;
export type ChatClientMessage = z.infer<typeof ChatClientMessageSchema>;
export type SaveTimelineFormClientMessage = z.infer<
  typeof SaveTimelineFormClientMessageSchema
>;
export type DeleteTimelineEventClientMessage = z.infer<
  typeof DeleteTimelineEventClientMessageSchema
>;
export type WebSocketClientMessage = z.infer<
  typeof WebSocketClientMessageSchema
>;

export type CommandsResultServerMessage = {
  type: 'commands_result';
  requestId: string;
  commands: WebCommandListItem[];
};

export type TimelineEventsResultServerMessage = {
  type: 'timeline_events_result';
  requestId: string;
  timelineId: string;
  items: TimelineHistoryItem[];
  hasMore: boolean;
};

export type CommandResultServerMessage = {
  type: 'command_result';
  requestId: string;
  output: string | WebNodeRoot;
};

export type PromptServerMessage = {
  type: 'prompt';
  requestId: string;
  prompt: PromptPayload;
};

export type ChatResultServerMessage = {
  type: 'chat_result';
  requestId: string;
  output: string;
};

export type ChatStreamChunkServerMessage = {
  type: 'chat_stream_chunk';
  requestId: string;
  chunk: AgentStreamChunk;
};

export type DoneServerMessage = {
  type: 'done';
  requestId: string;
};

export type ErrorServerMessage = {
  type: 'error';
  requestId: string;
  message: string;
};

export type WebSocketServerMessage =
  | CommandsResultServerMessage
  | TimelineEventsResultServerMessage
  | CommandResultServerMessage
  | PromptServerMessage
  | ChatStreamChunkServerMessage
  | ChatResultServerMessage
  | DoneServerMessage
  | ErrorServerMessage;

export function createCommandsResultMessage(params: {
  requestId: string;
  commands: WebCommandListItem[];
}): CommandsResultServerMessage {
  return {
    type: 'commands_result',
    requestId: params.requestId,
    commands: params.commands,
  };
}

export function createCommandResultMessage(params: {
  requestId: string;
  output: string | WebNodeRoot;
}): CommandResultServerMessage {
  return {
    type: 'command_result',
    requestId: params.requestId,
    output: params.output,
  };
}

export function createTimelineEventsResultMessage(params: {
  requestId: string;
  timelineId: string;
  items: TimelineHistoryItem[];
  hasMore: boolean;
}): TimelineEventsResultServerMessage {
  return {
    type: 'timeline_events_result',
    requestId: params.requestId,
    timelineId: params.timelineId,
    items: params.items,
    hasMore: params.hasMore,
  };
}

export function createPromptMessage(params: {
  requestId: string;
  prompt: PromptPayload;
}): PromptServerMessage {
  return {
    type: 'prompt',
    requestId: params.requestId,
    prompt: params.prompt,
  };
}

export function createChatResultMessage(params: {
  requestId: string;
  output: string;
}): ChatResultServerMessage {
  return {
    type: 'chat_result',
    requestId: params.requestId,
    output: params.output,
  };
}

export function createChatStreamChunkMessage(params: {
  requestId: string;
  chunk: AgentStreamChunk;
}): ChatStreamChunkServerMessage {
  return {
    type: 'chat_stream_chunk',
    requestId: params.requestId,
    chunk: params.chunk,
  };
}

export function createDoneMessage(requestId: string): DoneServerMessage {
  return {
    type: 'done',
    requestId,
  };
}

export function createErrorMessage(params: {
  requestId: string;
  message: string;
}): ErrorServerMessage {
  return {
    type: 'error',
    requestId: params.requestId,
    message: params.message,
  };
}
