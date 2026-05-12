import type { WebNodeRoot } from '@src/web/ui-schema';

import type { CommandOutput } from '../types';

import type {
  IncomingServerMessage,
  PendingRequest,
  PromptPayloadLike,
  SocketAppAdapters,
  SplitPromptPayloadResult,
} from './types';

export function splitPromptPayload(
  prompt: PromptPayloadLike,
): SplitPromptPayloadResult {
  if (prompt.type === 'text-prompt') {
    return {
      text: prompt.value,
      web: null,
    };
  }

  return {
    text: null,
    web: prompt.value,
  };
}

export function splitCommandOutput(output: CommandOutput | undefined): {
  text: string | null;
  web: Extract<CommandOutput, { kind: 'ui' }> | null;
  clientView: Extract<CommandOutput, { kind: 'client_view' }> | null;
  timelineEvent: Extract<CommandOutput, { kind: 'timeline_event' }> | null;
} {
  if (typeof output === 'string') {
    return {
      text: output,
      web: null,
      clientView: null,
      timelineEvent: null,
    };
  }

  if (output?.kind === 'ui') {
    return {
      text: null,
      web: output,
      clientView: null,
      timelineEvent: null,
    };
  }

  if (output?.kind === 'client_view') {
    return {
      text: null,
      web: null,
      clientView: output,
      timelineEvent: null,
    };
  }

  if (output?.kind === 'timeline_event') {
    return {
      text: null,
      web: null,
      clientView: null,
      timelineEvent: output,
    };
  }

  return {
    text: '(no output)',
    web: null,
    clientView: null,
    timelineEvent: null,
  };
}

export function replaceCommandResultWeb(
  setTimeline: SocketAppAdapters['setTimeline'],
  itemId: string,
  web: WebNodeRoot,
): void {
  setTimeline((prev) =>
    prev.map((entry) =>
      entry.id === itemId && entry.type === 'command_result'
        ? { ...entry, web, text: null }
        : entry,
    ),
  );
}

export function appendSystemMessageToTimeline(
  setTimeline: SocketAppAdapters['setTimeline'],
  createId: SocketAppAdapters['createId'],
  text: string,
): void {
  setTimeline((prev) => [...prev, { id: createId(), type: 'system', text }]);
}

export function handleServerMessage(params: {
  message: IncomingServerMessage;
  pendingRequests: Map<string, PendingRequest>;
  adapters: Pick<
    SocketAppAdapters,
    'appendSystemMessage' | 'chat' | 'setAgentWorking'
  >;
}): void {
  const { message, pendingRequests, adapters } = params;
  const pending = pendingRequests.get(message.requestId);

  switch (message.type) {
    case 'commands_result':
      pending?.onCommandsResult?.(message);

      return;
    case 'composer_ai_state_result':
      pending?.onComposerAiStateResult?.(message);

      return;
    case 'timeline_events_result':
      pending?.onTimelineEventsResult?.(message);

      return;
    case 'command_result':
      pending?.onCommandResult?.(message);

      return;
    case 'prompt':
      pending?.onPrompt?.(message);

      return;
    case 'chat_stream_chunk': {
      const chunk = message.chunk;

      if (chunk.kind === 'status') {
        adapters.setAgentWorking(chunk.phase === 'started');

        return;
      }

      if (chunk.kind === 'error') {
        adapters.setAgentWorking(false);

        return;
      }

      if (chunk.kind === 'diff') {
        adapters.chat.handleStreamDiff(message.requestId, chunk.files);

        return;
      }

      if (chunk.kind === 'tool') {
        adapters.chat.handleStreamTool(message.requestId, chunk.tool);

        return;
      }

      if (chunk.kind === 'reasoning_delta') {
        adapters.chat.handleStreamReasoningDelta(message.requestId, chunk.text);

        return;
      }

      if (chunk.kind === 'summary') {
        adapters.chat.handleStreamSummary(
          message.requestId,
          chunk.id,
          chunk.text,
        );

        return;
      }

      if (chunk.kind !== 'text_delta') {
        return;
      }

      adapters.chat.handleStreamTextDelta(message.requestId, chunk.text);

      return;
    }

    case 'chat_result':
      pending?.onChatResult?.(message);

      return;
    case 'done':
      adapters.setAgentWorking(false);
      pending?.onDone?.(message);
      pendingRequests.delete(message.requestId);
      adapters.chat.clearRequest(message.requestId);

      return;
    case 'error':
      adapters.setAgentWorking(false);
      pending?.onError?.(message);
      pendingRequests.delete(message.requestId);
      adapters.chat.clearRequest(message.requestId);
      adapters.appendSystemMessage(message.message);

      return;
  }
}
