import type { TimelineFileDiff, TimelineToolCall } from '@src/timeline/types';

import { splitPromptPayload } from '../socket/dispatch';
import type { TimelineItem } from '../types';

import { logChatDebug } from './debug';
import type { ChatAdapters, ChatHook } from './types';

export function useChat(adapters: ChatAdapters): ChatHook {
  const STREAM_TEXT_FLUSH_MS = 80;
  const CHAT_PROMPT_PREVIEW_LENGTH = 200;

  const chatStreamAssistantByRequestId = new Map<string, string>();
  const streamedAssistantRequestIds = new Set<string>();

  const reasoningStreamByRequestId = new Map<
    string,
    { itemId: string; text: string }
  >();

  const reasoningSegmentIndexByRequestId = new Map<string, number>();
  const pendingStreamTextByRequestId = new Map<string, string>();
  const streamFlushTimerByRequestId = new Map<string, number>();

  function flushStreamTextDelta(requestId: string): void {
    streamFlushTimerByRequestId.delete(requestId);

    const deltaText = pendingStreamTextByRequestId.get(requestId);
    pendingStreamTextByRequestId.delete(requestId);

    if (!deltaText) {
      logChatDebug('stream.flush.empty', { requestId });

      return;
    }

    logChatDebug('stream.flush', { requestId, length: deltaText.length });

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
    logChatDebug('timeline.user.append', {
      length: text.length,
      preview: text.slice(0, CHAT_PROMPT_PREVIEW_LENGTH),
    });

    adapters.setTimeline((prev) => [
      ...prev,
      { id: adapters.createId(), type: 'chat', role: 'user', text },
    ]);
  }

  function handleStreamTextDelta(requestId: string, deltaText: string): void {
    logChatDebug('stream.text_delta', {
      requestId,
      length: deltaText.length,
      pendingLength:
        (pendingStreamTextByRequestId.get(requestId)?.length ?? 0) +
        deltaText.length,
    });

    closeReasoningSegment(requestId);

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
    logChatDebug('stream.text_segment.close', { requestId });
  }

  function closeReasoningSegment(requestId: string): void {
    if (!reasoningStreamByRequestId.has(requestId)) {
      return;
    }

    reasoningStreamByRequestId.delete(requestId);
    logChatDebug('stream.reasoning_segment.close', { requestId });
  }

  function nextReasoningItemId(requestId: string): string {
    const next = (reasoningSegmentIndexByRequestId.get(requestId) ?? 0) + 1;

    reasoningSegmentIndexByRequestId.set(requestId, next);

    return `${requestId}-reasoning-${next}`;
  }

  function handleStreamReasoningDelta(
    requestId: string,
    deltaText: string,
  ): void {
    logChatDebug('stream.reasoning_delta', {
      requestId,
      length: deltaText.length,
    });

    closeTextSegmentBeforeStructuralChunk(requestId);

    const current = reasoningStreamByRequestId.get(requestId);
    const itemId = current?.itemId ?? nextReasoningItemId(requestId);

    reasoningStreamByRequestId.set(requestId, {
      itemId,
      text: (current?.text ?? '') + deltaText,
    });

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
    logChatDebug('stream.summary', { requestId, id, length: text.length });

    closeTextSegmentBeforeStructuralChunk(requestId);
    closeReasoningSegment(requestId);

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
    logChatDebug('stream.diff', {
      requestId,
      fileCount: files.length,
    });

    closeTextSegmentBeforeStructuralChunk(requestId);
    closeReasoningSegment(requestId);

    adapters.setSessionDiffFiles(files);
  }

  function handleStreamTool(requestId: string, tool: TimelineToolCall): void {
    logChatDebug('stream.tool', {
      requestId,
      callId: tool.callId,
      tool: tool.tool,
      title: tool.title,
      status: tool.status,
    });

    closeTextSegmentBeforeStructuralChunk(requestId);
    closeReasoningSegment(requestId);

    const itemId = `${requestId}-tool-${tool.callId}`;

    adapters.setTimeline((prev) => {
      let found = false;

      const next = prev.map((item) => {
        if (item.type !== 'tool' || item.tool.callId !== tool.callId) {
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
    logChatDebug('chat.result', {
      requestId,
      length: output.length,
      streamed: streamedAssistantRequestIds.has(requestId),
    });

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
    reasoningSegmentIndexByRequestId.delete(requestId);
    pendingStreamTextByRequestId.delete(requestId);
    logChatDebug('chat.result.cleanup', { requestId, hasStreamedAssistant });

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
    reasoningSegmentIndexByRequestId.delete(requestId);
    pendingStreamTextByRequestId.delete(requestId);
    logChatDebug('request.clear', { requestId });
  }

  function sendPromptAnswer(requestId: string, answer: string): void {
    logChatDebug('prompt_answer.send.attempt', {
      requestId,
      length: answer.length,
    });

    try {
      adapters.sendSocketMessage({
        type: 'prompt_answer',
        requestId,
        answer,
      });

      logChatDebug('prompt_answer.send.success', { requestId });
    } catch (err) {
      logChatDebug('prompt_answer.send.error', {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });

      adapters.appendSystemMessage(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  function sendChat(text: string): void {
    const requestId = adapters.createId();

    logChatDebug('chat.send.start', {
      requestId,
      timelineId: adapters.timelineId(),
      length: text.length,
      preview: text.slice(0, CHAT_PROMPT_PREVIEW_LENGTH),
    });

    appendUserMessage(text);
    adapters.setChatRunStatus('idle');
    adapters.setAgentWorking(true);

    adapters.pendingRequests.set(requestId, {
      onPrompt: (message) => {
        const prompt = splitPromptPayload(message.prompt);

        adapters.setAgentWorking(false);
        adapters.setPendingPromptRequestId(message.requestId);

        adapters.setTimeline((prev) => [
          ...prev,
          {
            id: adapters.createId(),
            type: 'prompt',
            requestId: message.requestId,
            text: prompt.text,
            web: prompt.web,
          },
        ]);
      },
      onChatResult: (message) => {
        logChatDebug('chat.pending.on_result', {
          requestId,
          outputLength: message.output.length,
        });

        adapters.setAgentWorking(false);

        if (adapters.chatRunStatus() !== 'interrupted') {
          adapters.setChatRunStatus('idle');
        }

        handleChatResult(requestId, message.output);
        adapters.onChatResult();
      },
      onError: (message) => {
        logChatDebug('chat.pending.on_error', {
          requestId,
          message: message.message,
        });

        adapters.setAgentWorking(false);

        if (adapters.chatRunStatus() !== 'interrupted') {
          adapters.setChatRunStatus('idle');
        }
      },
    });

    logChatDebug('chat.pending.registered', {
      requestId,
      pendingCount: adapters.pendingRequests.size,
    });

    try {
      adapters.sendSocketMessage({
        type: 'chat',
        requestId,
        timelineId: adapters.timelineId(),
        content: text,
      });

      logChatDebug('chat.socket.send.success', { requestId });
    } catch (err) {
      logChatDebug('chat.socket.send.error', {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });

      adapters.pendingRequests.delete(requestId);
      clearRequest(requestId);
      adapters.setAgentWorking(false);
      adapters.setChatRunStatus('idle');

      adapters.appendSystemMessage(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  function cancelChat(): void {
    logChatDebug('chat.cancel.start');

    adapters.setAgentWorking(false);
    adapters.setChatRunStatus('interrupted');

    try {
      adapters.sendSocketMessage({
        type: 'cancel_chat',
        requestId: adapters.createId(),
      });

      logChatDebug('chat.cancel.sent');
    } catch (err) {
      logChatDebug('chat.cancel.error', {
        error: err instanceof Error ? err.message : String(err),
      });

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
