import type { EventTemplate, NostrEvent } from 'nostr-tools';
import type { Accessor, Setter } from 'solid-js';

import type { AiModelSourceContextUsage } from '@src/capabilities/ai-model-source.v1';
import type {
  WebAction,
  WebNodeRoot,
  WebOptimisticMutation,
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
  backend: 'opencode';
  interventionAvailable: boolean;
  interventionEnabled: boolean;
  currentSessionId: string | null;
  modelSource: {
    providerId: string;
    state: {
      sourceId: string;
      title: string;
      active: boolean;
      transitionState: 'stable' | 'pending' | 'failed';
      health:
        | { status: 'healthy' }
        | { status: 'degraded' | 'unavailable'; message: string };
      selectedModelId: string | null;
      effectiveModelId: string;
      fallbackReason: 'selected' | 'root' | 'backend-default';
      catalogRevision: string;
    };
    models: Array<{
      id: string;
      label: string;
      description: string | null;
      group: string;
      contextWindowTokens: number | null;
      inputModalities: string[];
      outputModalities: string[];
      features: string[];
      privacy: string | null;
      price: {
        inputPerMillionTokens: string | null;
        outputPerMillionTokens: string | null;
        currency: string;
      } | null;
      favorite: boolean;
      lastUsedAt: string | null;
      availability:
        { status: 'available' } | { status: 'unavailable'; reason: string };
    }>;
  };
  modelSources: Array<{
    providerId: string;
    alias: string;
    title: string;
    active: boolean;
    health:
      | { status: 'healthy' }
      | { status: 'degraded' | 'unavailable'; message: string };
  }>;
  contextStats: AiModelSourceContextUsage | null;
};

export type RunWebActionParams = {
  onCommandSettled?: (error: string | null) => void;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  getWebRoot?: () => WebNodeRoot;
  applyOptimisticMutations?: (mutations: WebOptimisticMutation[]) => void;
  onCapabilityResult?: (root: WebNodeRoot) => boolean;
  onCapabilityError?: (message: string) => void;
  onCapabilitySettled?: () => void;
  promptRequestId?: string;
  uiExecutionPolicy?: {
    recordInTimeline?: boolean;
    suppressSystemMessage?: boolean;
  };
  webCommandSourceId?: string;
  webCommandSourceEntityKey?: string;
  webTargetRoot?: ParentNode;
};

export type WebEntityPendingState = {
  pending: boolean;
  label: string | null;
};

export type BeginWebEntityPendingProps = {
  sourceId: string;
  entityKey: string;
  label: string;
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
  timelineEvent: Extract<CommandOutput, { kind: 'timeline_event' }> | null;
};

export type CommandsAdapters = {
  authStatus: Accessor<string>;
  currentUserPubkey: Accessor<string | null>;
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
  signEvent: (
    event: EventTemplate,
    options?: { title: string | null; allowedPubkeys?: string[] | null },
  ) => Promise<NostrEvent | null>;
  nip44DecryptSelf: (ciphertext: string) => Promise<string | null>;
  createId: () => string;
  requestComposerAiState: () => void;
  refreshCoreUpdateState: () => Promise<void>;
  beginWebUiBusy: (sourceId: string) => void;
  endWebUiBusy: (sourceId: string) => void;
  beginWebEntityPending: (props: BeginWebEntityPendingProps) => void;
  endWebEntityPending: (sourceId: string, entityKey: string) => void;
  pendingRequests: Map<string, PendingRequest>;
  sendSocketMessage: (message: unknown) => void;
  runOpenCommandFormFromWebCommand: (action: CommandWebAction) => Promise<void>;
  isTaskbarSubcommand: (command: string, subcommand: string) => boolean;
  getTaskbarDockValues: (
    command: string,
    subcommand: string,
  ) => CommandPayload | null;
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
    iconUrl?: string | null;
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
  runJsonCommandOutput: (props: {
    command: string;
    subcommand: string;
    payload: unknown;
  }) => Promise<SplitCommandOutput>;
  runWebAction: (action: WebAction, params?: RunWebActionParams) => void;
  splitCommandOutput: (output: CommandOutput | undefined) => SplitCommandOutput;
};
