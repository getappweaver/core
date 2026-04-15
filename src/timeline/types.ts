import type { PromptPayload } from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import type { WebNodeRoot, WebOptionFieldHintValue } from '@src/web/ui-schema';

export type TimelinePayload = {
  arguments: Record<string, unknown>;
  options: Record<string, unknown>;
};

export type TimelineCommandField = {
  name: string;
  summary: string;
  kind: 'string' | 'integer' | 'boolean';
  required?: boolean;
  variadic?: boolean;
  flag?: string;
  shortFlag?: string | null;
  choices?: string[];
};

export type TimelineCommandSubcommand = {
  name: string;
  summary: string;
  usage: string;
  aliases: string[];
  arguments: TimelineCommandField[];
  options: TimelineCommandField[];
  examples: string[];
  inferredWeb?: {
    executionMode:
      | 'requires_input'
      | 'runnable_default'
      | 'runnable_customizable';
  };
};

export type TimelineCommandFormState = {
  subcommand: TimelineCommandSubcommand;
  values: TimelinePayload;
  autoRun: boolean;
  /** Web-only hints for options; never sent as command payload. */
  optionHints?: Record<string, WebOptionFieldHintValue>;
};

export type TimelineEventKind =
  | 'system'
  | 'chat'
  | 'prompt'
  | 'command_result'
  | 'command_form';

export type TimelineHistoryItem =
  | {
      id: string;
      type: 'system';
      text: string;
      createdAt: number;
      source: MessageSource;
    }
  | {
      id: string;
      type: 'chat';
      role: 'user' | 'assistant';
      text: string;
      createdAt: number;
      source: MessageSource;
    }
  | {
      id: string;
      type: 'prompt';
      requestId: string;
      text: string | null;
      web: WebNodeRoot | null;
      createdAt: number;
      source: MessageSource;
    }
  | {
      id: string;
      type: 'command_result';
      command: string;
      subcommand: string;
      subcommandTag: string;
      values: TimelinePayload | null;
      text: string | null;
      web: WebNodeRoot | null;
      createdAt: number;
      source: MessageSource;
    }
  | {
      id: string;
      type: 'command_form';
      command: string;
      subcommand: TimelineCommandSubcommand;
      values: TimelinePayload;
      autoRun: boolean;
      optionHints?: Record<string, WebOptionFieldHintValue>;
      createdAt: number;
      source: MessageSource;
    };

export type TimelineEventRecord = {
  id: string;
  timelineId: string;
  source: MessageSource;
  kind: TimelineEventKind;
  role: 'user' | 'assistant' | null;
  command: string | null;
  subcommand: string | null;
  subcommandTag: string | null;
  values: TimelinePayload | null;
  form: TimelineCommandFormState | null;
  text: string | null;
  web: WebNodeRoot | null;
  prompt: PromptPayload | null;
  requestId: string | null;
  createdAt: number;
};
