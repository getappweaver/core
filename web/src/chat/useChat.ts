import type { TimelineFileDiff, TimelineToolCall } from '@src/timeline/types';

import type { TimelineItem } from '../types';

import type { ChatAdapters, ChatHook } from './types';

export function useChat(adapters: ChatAdapters): ChatHook {
  const STREAM_TEXT_FLUSH_MS = 80;

  const chatStreamAssistantByRequestId = new Map<string, string>();
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

  function handleStreamDiff(
    requestId: string,
    files: TimelineFileDiff[],
  ): void {
    const timer = streamFlushTimerByRequestId.get(requestId);

    if (timer !== undefined) {
      clearTimeout(timer);
      flushStreamTextDelta(requestId);
    }

    adapters.setTimeline((prev) => [
      ...prev,
      {
        id: adapters.createId(),
        type: 'diff',
        files,
        meta: {
          title: 'Patched',
          subtitle: null,
          origin: 'agent_patch',
        },
      } satisfies TimelineItem,
    ]);
  }

  function handleStreamTool(requestId: string, tool: TimelineToolCall): void {
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
    chatStreamAssistantByRequestId.delete(requestId);
    pendingStreamTextByRequestId.delete(requestId);

    adapters.setTimeline((prev) => {
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
    handleStreamTool,
    handleStreamTextDelta,
    sendChat,
    sendPromptAnswer,
  };
}
