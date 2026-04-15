import type { AgentStreamChunk } from '@src/backends/agent-stream-chunk';
import type { TimelineHistoryItem } from '@src/timeline/types';
import type { WebNodeRoot } from '@src/web/ui-schema';

import type { CommandDetail } from './types';

export type PromptPayload =
  | {
      type: 'text-prompt';
      value: string;
    }
  | {
      type: 'web-prompt';
      value: WebNodeRoot;
    };

export type CommandsResultServerMessage = {
  type: 'commands_result';
  requestId: string;
  commands: CommandDetail[];
};

export type CommandResultServerMessage = {
  type: 'command_result';
  requestId: string;
  output: string | WebNodeRoot;
};

export type TimelineEventsResultServerMessage = {
  type: 'timeline_events_result';
  requestId: string;
  timelineId: string;
  items: TimelineHistoryItem[];
  hasMore: boolean;
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
