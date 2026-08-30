import type { Accessor, Setter } from 'solid-js';

import type { AgentFileDiff } from '@src/backends/agent-stream-chunk';

import type { ChatHook } from '../chat/types';
import type { NostrAuthContextValue } from '../contexts/NostrAuthContext';
import type { CommandDetail, TimelineItem } from '../types';
import type {
  CapabilityProvidersResultServerMessage,
  CapabilityResultServerMessage,
  ChatResultServerMessage,
  ChatStreamChunkServerMessage,
  CommandResultServerMessage,
  ComposerAiStateResultServerMessage,
  CommandsResultServerMessage,
  DoneServerMessage,
  ErrorServerMessage,
  InterventionRequestServerMessage,
  PromptPayload,
  PromptServerMessage,
  TimelineEventsResultServerMessage,
  ToolIntervention,
} from '../ws-types';

export type PendingRequest = {
  recordInTimeline?: boolean;
  suppressErrorUi?: boolean;
  onCommandsResult?: (message: CommandsResultServerMessage) => void;
  onComposerAiStateResult?: (
    message: ComposerAiStateResultServerMessage,
  ) => void;
  onTimelineEventsResult?: (message: TimelineEventsResultServerMessage) => void;
  onCapabilityProvidersResult?: (
    message: CapabilityProvidersResultServerMessage,
  ) => void;
  onCapabilityResult?: (message: CapabilityResultServerMessage) => void;
  onCommandResult?: (message: CommandResultServerMessage) => void;
  onPrompt?: (message: PromptServerMessage) => void;
  onChatResult?: (message: ChatResultServerMessage) => void;
  onDone?: (message: DoneServerMessage) => void;
  onError?: (message: ErrorServerMessage) => void;
};

export type IncomingServerMessage =
  | CommandsResultServerMessage
  | ComposerAiStateResultServerMessage
  | TimelineEventsResultServerMessage
  | CapabilityProvidersResultServerMessage
  | CapabilityResultServerMessage
  | CommandResultServerMessage
  | PromptServerMessage
  | ChatStreamChunkServerMessage
  | InterventionRequestServerMessage
  | ChatResultServerMessage
  | DoneServerMessage
  | ErrorServerMessage;

export type SplitPromptPayloadResult = {
  text: string | null;
  web: import('@src/web/ui-schema').WebNodeRoot | null;
};

export type SocketAppAdapters = {
  auth: Pick<NostrAuthContextValue, 'authState' | 'getNip98Token'>;
  timelineId: Accessor<string>;
  setCommands: Setter<CommandDetail[]>;
  setComposerAiState: Setter<
    import('../commands/types').ComposerAiState | null
  >;
  setLoadingCommands: Setter<boolean>;
  setAgentWorking: Setter<boolean>;
  setToolInterventions: Setter<Record<string, ToolIntervention>>;
  setSessionDiffFiles: Setter<AgentFileDiff[]>;
  setTimeline: Setter<TimelineItem[]>;
  appendSystemMessage: (text: string) => void;
  createId: () => string;
  chat: Pick<
    ChatHook,
    | 'clearRequest'
    | 'handleStreamDiff'
    | 'handleStreamReasoningDelta'
    | 'handleStreamSummary'
    | 'handleStreamTextDelta'
    | 'handleStreamTool'
  >;
};

export type SocketState = {
  socket: WebSocket | null;
  wsReconnectTimer: number | null;
  pendingRequests: Map<string, PendingRequest>;
};

export type SocketConnectHandlers = {
  setWsConnected: (value: boolean) => void;
  clearWebPendingState: () => void;
};

export type SocketOpenHandlers = {
  clearSocketReconnectTimer: () => void;
  sendSocketMessage: (message: unknown) => void;
};

export type SocketCloseHandlers = SocketConnectHandlers & {
  scheduleSocketReconnect: () => void;
};

export type SocketMessageHandlers = {
  handleServerMessage: (message: IncomingServerMessage) => void;
};

export type SocketAuthBootstrapHandlers = {
  setWsConnected: (value: boolean) => void;
  clearSocketReconnectTimer: () => void;
  sendSocketMessage: (message: unknown) => void;
};

export type PromptPayloadLike = PromptPayload;
