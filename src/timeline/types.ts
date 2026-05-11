import type {
  AgentFileDiff,
  AgentToolCall,
} from '@src/backends/agent-stream-chunk';
import type { PromptPayload } from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import type {
  ClientViewRoot,
  WebArgumentFieldChoice,
  WebNodeRoot,
  WebOptionFieldHintValue,
} from '@src/web/ui-schema';

export type TimelinePayload = {
  arguments: Record<string, unknown>;
  options: Record<string, unknown>;
};

export type TimelineFileDiff = AgentFileDiff;
export type TimelineToolCall = AgentToolCall;

export type TimelineDiffSummary = {
  fileCount: number;
  additions: number;
  deletions: number;
};

export type TimelineDiffOrigin = 'workspace_diff' | 'git_commit';

export type TimelineEventMeta = {
  title: string | null;
  subtitle: string | null;
  origin: TimelineDiffOrigin | null;
};

export function summarizeTimelineDiffFiles(
  files: TimelineFileDiff[],
): TimelineDiffSummary {
  return {
    fileCount: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

export type TimelineCommandField = {
  name: string;
  summary: string;
  kind: 'string' | 'integer' | 'boolean';
  required?: boolean;
  variadic?: boolean;
  multiple?: boolean;
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
  /** Web-only suggested values for arguments (e.g. OpenCode models from opencode.json). */
  argumentChoices?: Record<string, WebArgumentFieldChoice[]>;
};

export type TimelineEventKind =
  | 'system'
  | 'chat'
  | 'diff'
  | 'diff_summary'
  | 'tool'
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
      type: 'diff';
      files: TimelineFileDiff[];
      meta: TimelineEventMeta | null;
      createdAt: number;
      source: MessageSource;
    }
  | {
      id: string;
      type: 'diff_summary';
      summary: TimelineDiffSummary;
      createdAt: number;
      source: MessageSource;
    }
  | {
      id: string;
      type: 'tool';
      tool: TimelineToolCall;
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
      clientView: ClientViewRoot | null;
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
      argumentChoices?: Record<string, WebArgumentFieldChoice[]>;
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
  clientView: ClientViewRoot | null;
  diff: TimelineFileDiff[] | null;
  meta: TimelineEventMeta | null;
  diffSummary: TimelineDiffSummary | null;
  tool: TimelineToolCall | null;
  prompt: PromptPayload | null;
  requestId: string | null;
  createdAt: number;
};
