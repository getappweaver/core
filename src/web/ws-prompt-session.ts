import type { PromptFn, PromptPayload } from '@src/core/plugin';

import {
  createPromptMessage,
  type PromptAnswerClientMessage,
  type PromptServerMessage,
  type WebSocketServerMessage,
} from './ws-schema';

export type WebSocketMessageSender = (
  message: WebSocketServerMessage,
) => Promise<void> | void;

type PendingPromptResolver = (answer: string) => void;
type PendingPromptEntry = {
  resolve: PendingPromptResolver;
  timelineId: string;
  /** When false, prompt answers must not insert timeline rows (chrome / modal runs). */
  recordInTimeline: boolean;
};

export class WebSocketPromptSession {
  private readonly pendingByRequestId = new Map<string, PendingPromptEntry>();

  createPromptFn(params: {
    requestId: string;
    timelineId: string;
    recordInTimeline: boolean;
    send: WebSocketMessageSender;
  }): PromptFn {
    return async (message: string | PromptPayload): Promise<string> => {
      const prompt =
        typeof message === 'string'
          ? ({ type: 'text-prompt', value: message } as const)
          : message;

      await params.send(
        createPromptMessage({
          requestId: params.requestId,
          prompt,
        }),
      );

      return new Promise((resolve) => {
        this.pendingByRequestId.set(params.requestId, {
          resolve,
          timelineId: params.timelineId,
          recordInTimeline: params.recordInTimeline,
        });
      });
    };
  }

  resolvePromptAnswer(message: PromptAnswerClientMessage): {
    resolved: boolean;
    timelineId: string | null;
    recordInTimeline: boolean;
  } {
    const entry = this.pendingByRequestId.get(message.requestId);

    if (!entry) {
      return { resolved: false, timelineId: null, recordInTimeline: true };
    }

    this.pendingByRequestId.delete(message.requestId);
    entry.resolve(message.answer);

    return {
      resolved: true,
      timelineId: entry.timelineId,
      recordInTimeline: entry.recordInTimeline,
    };
  }

  clearRequest(requestId: string): void {
    this.pendingByRequestId.delete(requestId);
  }

  clearAll(): void {
    this.pendingByRequestId.clear();
  }

  hasPendingRequest(requestId: string): boolean {
    return this.pendingByRequestId.has(requestId);
  }

  peekPromptMessage(params: {
    requestId: string;
    prompt: PromptPayload;
  }): PromptServerMessage {
    return createPromptMessage(params);
  }
}
