import type { EventTemplate, NostrEvent } from 'nostr-tools';
import type { Accessor, Setter } from 'solid-js';

import type {
  WebAction,
  WebArgumentFieldChoice,
  WebNodeRoot,
} from '@src/web/ui-schema';

import type { ChromeModalState, ChromePromptSession } from '../chrome/types';
import type { PendingRequest } from '../socket/types';
import type {
  CommandOutput,
  CommandPayload,
  CommandSubcommand,
  TimelineItem,
} from '../types';

export type ComposerAiState = {
  backend: string;
  executionProfileLabel: 'Agent' | 'Mode';
  executionProfileName: string;
  executionProfileColor: string | null;
  effectiveModel: string;
  provider: string;
  modelOverride: string | null;
  opencodeModelFormChoices: WebArgumentFieldChoice[];
  contextStats: {
    tokensTotal: number;
    contextLimit: number | null;
    contextPercent: number | null;
  } | null;
};

export type RunWebActionParams = {
  onReplaceRoot?: (root: WebNodeRoot) => void;
  promptRequestId?: string;
  uiExecutionPolicy?: {
    recordInTimeline?: boolean;
    suppressSystemMessage?: boolean;
  };
  webCommandSourceId?: string;
};

export type CommandWebAction = Extract<WebAction, { type: 'command' }>;

export type RequestChromeCommandProps = {
  command: string;
  subcommand: string;
  title: string;
  payload: CommandPayload;
};

export type SplitCommandOutput = {
  text: string | null;
  web: Extract<CommandOutput, { kind: 'ui' }> | null;
  clientView: Extract<CommandOutput, { kind: 'client_view' }> | null;
};

export type CommandsAdapters = {
  authStatus: Accessor<string>;
  wsConnected: Accessor<boolean>;
  timelineId: Accessor<string>;
  pendingPromptRequestId: Accessor<string | null>;
  setPendingPromptRequestId: Setter<string | null>;
  setComposerText: Setter<string>;
  chromePromptSession: Accessor<ChromePromptSession | null>;
  setChromePromptSession: Setter<ChromePromptSession | null>;
  setChromeModal: Setter<ChromeModalState | null>;
  setChromeLoading: Setter<boolean>;
  setChromeError: Setter<string | null>;
  setChromeText: Setter<string | null>;
  setChromeWeb: Setter<WebNodeRoot | null>;
  setTimeline: Setter<TimelineItem[]>;
  setComposerAiState: Setter<ComposerAiState | null>;
  appendSystemMessage: (text: string) => void;
  signEvent: (event: EventTemplate) => Promise<NostrEvent | null>;
  createId: () => string;
  requestComposerAiState: () => void;
  beginWebUiBusy: (sourceId: string) => void;
  endWebUiBusy: (sourceId: string) => void;
  pendingRequests: Map<string, PendingRequest>;
  sendSocketMessage: (message: unknown) => void;
  runOpenCommandFormFromWebCommand: (action: CommandWebAction) => Promise<void>;
  isTaskbarSubcommand: (command: string, subcommand: string) => boolean;
  setTaskbarDockResult: (params: {
    command: string;
    subcommand: string;
    values: CommandPayload;
    output: SplitCommandOutput;
    visible: boolean;
  }) => void;
};

export type CommandsHook = {
  closeChromeModal: () => void;
  openChromeWidget: (props: {
    command: string;
    subcommand: string;
    title: string;
  }) => void;
  refreshComposerAiState: () => Promise<void>;
  requestChromeCommand: (props: RequestChromeCommandProps) => void;
  runCommand: (
    command: string,
    subcommand: CommandSubcommand,
    values: CommandPayload,
  ) => Promise<void>;
  runJsonCommand: (props: {
    command: string;
    subcommand: string;
    payload: unknown;
  }) => Promise<string>;
  runWebAction: (action: WebAction, params?: RunWebActionParams) => void;
  splitCommandOutput: (output: CommandOutput | undefined) => SplitCommandOutput;
};
