import type { MessageSource } from '@src/messaging';
import type {
  TimelineDiffSummary,
  TimelineFileDiff,
  TimelinePayload,
  TimelineToolCall,
} from '@src/timeline/types';
import type {
  ClientViewRoot,
  TimelineEventOutput,
  WebArgumentFieldChoice,
  WebNodeRoot,
  WebOptionFieldHintValue,
} from '@src/web/ui-schema';

export type CommandField = {
  name: string;
  summary: string;
  kind: 'string' | 'integer' | 'boolean';
  webDefaultValue?: string | number | boolean;
  required?: boolean;
  variadic?: boolean;
  multiple?: boolean;
  flag?: string;
  shortFlag?: string | null;
  /** When present on a string option, prefer a dropdown in the web form. */
  choices?: string[];
};

export type WebWidget = {
  placement: 'header' | 'fixed';
  surface: 'modal' | 'timeline_singleton';
  label?: string;
  modalTitle: string;
  icon?: string;
  order?: number;
};

export type PermissionAction = 'allow' | 'ask' | 'deny';
export type PermissionValue =
  | PermissionAction
  | Record<string, PermissionAction>;

export type OpenCodeAgentPermissionConfig =
  | PermissionAction
  | Record<string, PermissionValue>
  | null;

export type OpenCodeAgentDraftConfig = {
  name: string;
  description: string | null;
  model: string | null;
  color: string | null;
  steps: number | null;
  hidden: boolean;
  disabled: boolean;
  mode: string | null;
  permission: OpenCodeAgentPermissionConfig;
  systemPrompt: string;
};

export type OpenCodeAgentsDraft = {
  rootModel: string | null;
  agents: OpenCodeAgentDraftConfig[];
};

export type OpenCodeAgentsModalData = {
  original: OpenCodeAgentsDraft;
  defaults: OpenCodeAgentsDraft;
  selectedAgentName: string;
};

export type AiAgentEditorValues = {
  name: string;
  description: string;
  model: string;
  color: string;
  steps: string;
  mode: string;
  systemPrompt: string;
  hidden: boolean;
  disabled: boolean;
  permissions: Record<string, '' | PermissionAction>;
};

export type AiAgentEditorPayload = {
  mode: 'new' | 'edit';
  originalName: string | null;
  values: AiAgentEditorValues;
  /** From `opencode models` (server); may be `[]` if CLI unavailable. */
  modelCatalog: WebArgumentFieldChoice[];
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
  webWidget?: WebWidget;
};

export type CommandDetail = {
  name: string;
  summary: string;
  aliases: string[];
  /** Present on commands from GET /api/commands (bulk or single). */
  source?: 'builtin' | 'plugin';
  pluginAlias?: string;
  subcommands: CommandSubcommand[];
};

export type CommandPayload = TimelinePayload;

export type CommandOutput =
  | string
  | WebNodeRoot
  | ClientViewRoot
  | TimelineEventOutput;

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
      type: 'reasoning';
      text: string;
    }
  | {
      id: string;
      createdAt?: number;
      source?: MessageSource;
      type: 'agent_summary';
      text: string;
    }
  | {
      id: string;
      createdAt?: number;
      source?: MessageSource;
      type: 'diff';
      files: TimelineFileDiff[];
      meta?: {
        title: string | null;
        subtitle: string | null;
        origin: 'workspace_diff' | 'git_commit' | 'agent_patch' | null;
      } | null;
    }
  | {
      id: string;
      createdAt?: number;
      source?: MessageSource;
      type: 'diff_summary';
      summary: TimelineDiffSummary;
    }
  | {
      id: string;
      createdAt?: number;
      source?: MessageSource;
      type: 'tool';
      tool: TimelineToolCall;
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
      clientView: ClientViewRoot | null;
      timelineSingletonKey?: string;
      timelineSingletonHidden?: boolean;
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
      argumentChoices?: Record<string, WebArgumentFieldChoice[]>;
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

export function isReasoningItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'reasoning' }> {
  return item.type === 'reasoning';
}

export function isAgentSummaryItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'agent_summary' }> {
  return item.type === 'agent_summary';
}

export function isDiffItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'diff' }> {
  return item.type === 'diff';
}

export function isDiffSummaryItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'diff_summary' }> {
  return item.type === 'diff_summary';
}

export function isToolItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { type: 'tool' }> {
  return item.type === 'tool';
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
