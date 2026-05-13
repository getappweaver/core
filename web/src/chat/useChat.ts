import type { TimelineFileDiff, TimelineToolCall } from '@src/timeline/types';

import type { TimelineItem } from '../types';

import type { ChatAdapters, ChatHook } from './types';

export function useChat(adapters: ChatAdapters): ChatHook {
  const STREAM_TEXT_FLUSH_MS = 80;

  const chatStreamAssistantByRequestId = new Map<string, string>();
  const streamedAssistantRequestIds = new Set<string>();
  const reasoningStreamByRequestId = new Map<string, string>();
  const pendingStreamTextByRequestId = new Map<string, string>();
  const streamFlushTimerByRequestId = new Map<string, number>();

  function flushStreamTextDelta(requestId: string): void {
    streamFlushTimerByRequestId.delete(requestId);

    const deltaText = pendingStreamTextByRequestId.get(requestId);
    pendingStreamTextByRequestId.delete(requestId);

    if (!deltaText) {
      return;
    }

    adapters.setTimeline((prev) => {
      let assistantId = chatStreamAssistantByRequestId.get(requestId);

      if (!assistantId) {
        assistantId = adapters.createId();
        chatStreamAssistantByRequestId.set(requestId, assistantId);
        streamedAssistantRequestIds.add(requestId);

        return [
          ...prev,
          {
            id: assistantId,
            type: 'chat',
            role: 'assistant',
            text: deltaText,
          } satisfies TimelineItem,
        ];
      }

      return prev.map((item) =>
        item.id === assistantId &&
        item.type === 'chat' &&
        item.role === 'assistant'
          ? { ...item, text: item.text + deltaText }
          : item,
      );
    });
  }

  function appendUserMessage(text: string): void {
    adapters.setTimeline((prev) => [
      ...prev,
      { id: adapters.createId(), type: 'chat', role: 'user', text },
    ]);
  }

  function handleStreamTextDelta(requestId: string, deltaText: string): void {
    pendingStreamTextByRequestId.set(
      requestId,
      (pendingStreamTextByRequestId.get(requestId) ?? '') + deltaText,
    );

    if (streamFlushTimerByRequestId.has(requestId)) {
      return;
    }

    const timer = window.setTimeout(
      () => flushStreamTextDelta(requestId),
      STREAM_TEXT_FLUSH_MS,
    );

    streamFlushTimerByRequestId.set(requestId, timer);
  }

  function closeTextSegmentBeforeStructuralChunk(requestId: string): void {
    const timer = streamFlushTimerByRequestId.get(requestId);

    if (timer !== undefined) {
      clearTimeout(timer);
      flushStreamTextDelta(requestId);
    }

    chatStreamAssistantByRequestId.delete(requestId);
  }

  function handleStreamReasoningDelta(
    requestId: string,
    deltaText: string,
  ): void {
    closeTextSegmentBeforeStructuralChunk(requestId);

    const itemId = `${requestId}-reasoning`;

    reasoningStreamByRequestId.set(
      requestId,
      (reasoningStreamByRequestId.get(requestId) ?? '') + deltaText,
    );

    adapters.setTimeline((prev) => {
      let found = false;

      const next = prev.map((item) => {
        if (item.id !== itemId || item.type !== 'reasoning') {
          return item;
        }

        found = true;

        return { ...item, text: item.text + deltaText } satisfies TimelineItem;
      });

      if (found) {
        return next;
      }

      return [
        ...prev,
        {
          id: itemId,
          type: 'reasoning',
          text: deltaText,
        } satisfies TimelineItem,
      ];
    });
  }

  function handleStreamSummary(
    requestId: string,
    id: string,
    text: string,
  ): void {
    closeTextSegmentBeforeStructuralChunk(requestId);

    adapters.setTimeline((prev) => {
      const itemId = `${requestId}-summary-${id}`;

      if (prev.some((item) => item.id === itemId)) {
        return prev;
      }

      return [
        ...prev,
        {
          id: itemId,
          type: 'agent_summary',
          text,
        } satisfies TimelineItem,
      ];
    });
  }

  function handleStreamDiff(
    requestId: string,
    files: TimelineFileDiff[],
  ): void {
    closeTextSegmentBeforeStructuralChunk(requestId);

    adapters.setTimeline((prev) => [
      ...prev,
      {
        id: adapters.createId(),
        type: 'diff',
        files,
        meta: {
          title: 'Git diff',
          subtitle: null,
          origin: 'agent_patch',
        },
      } satisfies TimelineItem,
    ]);
  }

  function handleStreamTool(requestId: string, tool: TimelineToolCall): void {
    closeTextSegmentBeforeStructuralChunk(requestId);

    const itemId = `${requestId}-tool-${tool.callId}`;

    adapters.setTimeline((prev) => {
      let found = false;

      const next = prev.map((item) => {
        if (item.id !== itemId || item.type !== 'tool') {
          return item;
        }

        found = true;

        return { ...item, tool } satisfies TimelineItem;
      });

      if (found) {
        return next;
      }

      return [
        ...prev,
        {
          id: itemId,
          type: 'tool',
          tool,
        } satisfies TimelineItem,
      ];
    });
  }

  function handleChatResult(requestId: string, output: string): void {
    const timer = streamFlushTimerByRequestId.get(requestId);

    if (timer !== undefined) {
      clearTimeout(timer);
      flushStreamTextDelta(requestId);
    }

    const assistantId = chatStreamAssistantByRequestId.get(requestId);
    const hasStreamedAssistant = streamedAssistantRequestIds.has(requestId);

    chatStreamAssistantByRequestId.delete(requestId);
    streamedAssistantRequestIds.delete(requestId);
    reasoningStreamByRequestId.delete(requestId);
    pendingStreamTextByRequestId.delete(requestId);

    adapters.setTimeline((prev) => {
      if (hasStreamedAssistant) {
        return prev;
      }

      if (assistantId) {
        return prev.map((item) =>
          item.id === assistantId &&
          item.type === 'chat' &&
          item.role === 'assistant'
            ? {
                ...item,
                text: output || '(no output)',
              }
            : item,
        );
      }

      return [
        ...prev,
        {
          id: adapters.createId(),
          type: 'chat',
          role: 'assistant',
          text: output || '(no output)',
        },
      ];
    });
  }

  function clearRequest(requestId: string): void {
    const timer = streamFlushTimerByRequestId.get(requestId);

    if (timer !== undefined) {
      clearTimeout(timer);
      streamFlushTimerByRequestId.delete(requestId);
    }

    chatStreamAssistantByRequestId.delete(requestId);
    streamedAssistantRequestIds.delete(requestId);
    reasoningStreamByRequestId.delete(requestId);
    pendingStreamTextByRequestId.delete(requestId);
  }

  function sendPromptAnswer(requestId: string, answer: string): void {
    try {
      adapters.sendSocketMessage({
        type: 'prompt_answer',
        requestId,
        answer,
      });
    } catch (err) {
      adapters.appendSystemMessage(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  function sendChat(text: string): void {
    appendUserMessage(text);
    adapters.setAgentWorking(true);

    const requestId = adapters.createId();

    adapters.pendingRequests.set(requestId, {
      onChatResult: (message) => {
        adapters.setAgentWorking(false);
        handleChatResult(requestId, message.output);
        adapters.onChatResult();
      },
      onError: () => {
        adapters.setAgentWorking(false);
      },
    });

    try {
      adapters.sendSocketMessage({
        type: 'chat',
        requestId,
        timelineId: adapters.timelineId(),
        content: text,
      });
    } catch (err) {
      adapters.pendingRequests.delete(requestId);
      clearRequest(requestId);
      adapters.setAgentWorking(false);

      adapters.appendSystemMessage(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  function cancelChat(): void {
    adapters.setAgentWorking(false);

    try {
      adapters.sendSocketMessage({
        type: 'cancel_chat',
        requestId: adapters.createId(),
      });
    } catch (err) {
      adapters.appendSystemMessage(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    appendUserMessage,
    cancelChat,
    clearRequest,
    handleChatResult,
    handleStreamDiff,
    handleStreamReasoningDelta,
    handleStreamSummary,
    handleStreamTool,
    handleStreamTextDelta,
    sendChat,
    sendPromptAnswer,
  };
}
