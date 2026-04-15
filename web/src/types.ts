import type { MessageSource } from '@src/messaging';
import type { TimelinePayload } from '@src/timeline/types';
import type { WebNodeRoot, WebOptionFieldHintValue } from '@src/web/ui-schema';

export type CommandField = {
  name: string;
  summary: string;
  kind: 'string' | 'integer' | 'boolean';
  webDefaultValue?: string | number | boolean;
  required?: boolean;
  variadic?: boolean;
  flag?: string;
  shortFlag?: string | null;
  /** When present on a string option, prefer a dropdown in the web form. */
  choices?: string[];
};

export type WebHeaderWidget = {
  label: string;
  modalTitle: string;
};

export type CommandSubcommand = {
  name: string;
  summary: string;
  usage: string;
  aliases: string[];
  arguments: CommandField[];
  options: CommandField[];
  examples: string[];
  inferredWeb?: {
    executionMode:
      | 'requires_input'
      | 'runnable_default'
      | 'runnable_customizable';
  };
  webHeaderWidget?: WebHeaderWidget;
};

export type CommandDetail = {
  name: string;
  summary: string;
  aliases: string[];
  /** Present on commands from GET /api/commands (bulk or single). */
  source?: 'builtin' | 'plugin';
  subcommands: CommandSubcommand[];
};

export type CommandPayload = TimelinePayload;

export type CommandOutput = string | WebNodeRoot;

export type TimelineItem =
  | {
      id: string;
      createdAt?: number;
      source?: MessageSource;
      type: 'system';
      text: string;
    }
  | {
      id: string;
      createdAt?: number;
      source?: MessageSource;
      type: 'chat';
      role: 'user' | 'assistant';
      text: string;
    }
  | {
      id: string;
      createdAt?: number;
      source?: MessageSource;
      type: 'prompt';
      requestId: string;
      text: string | null;
      web: WebNodeRoot | null;
    }
  | {
      id: string;
      createdAt?: number;
      source?: MessageSource;
      type: 'command_result';
      command: string;
      subcommand: string;
      subcommandTag: string;
      values: CommandPayload | null;
      text: string | null;
      web: WebNodeRoot | null;
    }
  | {
      id: string;
      createdAt?: number;
      source?: MessageSource;
      type: 'command_form';
      command: string;
      subcommand: CommandSubcommand;
      values: CommandPayload;
      autoRun: boolean;
      optionHints?: Record<string, WebOptionFieldHintValue>;
    };

export function isSystemItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'system' }> {
  return item.type === 'system';
}

export function isChatItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'chat' }> {
  return item.type === 'chat';
}

export function isPromptItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'prompt' }> {
  return item.type === 'prompt';
}

export function isCommandResultItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'command_result' }> {
  return item.type === 'command_result';
}

export function isCommandFormItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'command_form' }> {
  return item.type === 'command_form';
}
