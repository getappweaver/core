import type { Accessor, Setter } from 'solid-js';

import type { TimelineFileDiff, TimelineToolCall } from '@src/timeline/types';

import type { PendingRequest } from '../socket/types';
import type { TimelineItem } from '../types';

export type ChatAdapters = {
  timelineId: Accessor<string>;
  setTimeline: Setter<TimelineItem[]>;
  createId: () => string;
  pendingRequests: Map<string, PendingRequest>;
  sendSocketMessage: (message: unknown) => void;
  appendSystemMessage: (text: string) => void;
  setAgentWorking: Setter<boolean>;
  onChatResult: () => void;
};

export type ChatHook = {
  appendUserMessage: (text: string) => void;
  cancelChat: () => void;
  clearRequest: (requestId: string) => void;
  handleChatResult: (requestId: string, output: string) => void;
  handleStreamReasoningDelta: (requestId: string, deltaText: string) => void;
  handleStreamSummary: (requestId: string, id: string, text: string) => void;
  handleStreamDiff: (requestId: string, files: TimelineFileDiff[]) => void;
  handleStreamTool: (requestId: string, tool: TimelineToolCall) => void;
  handleStreamTextDelta: (requestId: string, deltaText: string) => void;
  sendChat: (text: string) => void;
  sendPromptAnswer: (requestId: string, answer: string) => void;
};
