import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createSignal } from 'solid-js';

import { handleServerMessage } from './dispatch';
import type { SocketAppAdapters } from './types';

type MessageAdapters = Parameters<typeof handleServerMessage>[0]['adapters'];

function createAdapters() {
  const [activeSession] = createSignal('b');
  const [working, setWorking] = createSignal(true);

  const [timeline, setTimeline] = createSignal<
    import('../types').TimelineItem[]
  >([]);

  const [, setInterventions] = createSignal<
    Record<string, import('../ws-types').ToolIntervention>
  >({});

  const [, setPaymentRequest] = createSignal<
    import('@src/payments/web-types').WebPaymentRequest | null
  >(null);

  const [, setPaymentStatus] = createSignal<
    import('@src/payments/web-types').WebPaymentStatus | null
  >(null);

  const [, setComposerAiState] = createSignal<
    import('../commands/types').ComposerAiState | null
  >(null);

  const deltas: string[] = [];

  const adapters: MessageAdapters = {
    timelineId: activeSession,
    setAgentWorking: setWorking,
    setTimeline,
    setToolInterventions: setInterventions,
    setPaymentRequest,
    setPaymentStatus,
    setComposerAiState,
    appendSystemMessage: () => undefined,
    chat: {
      clearRequest: () => undefined,
      handleStreamDiff: () => undefined,
      handleStreamReasoningDelta: () => undefined,
      handleStreamSummary: () => undefined,
      handleStreamTool: () => undefined,
      handleStreamTextDelta: (_requestId, text) => deltas.push(text),
    },
  } satisfies Pick<SocketAppAdapters, keyof MessageAdapters>;

  return { adapters, working, timeline, deltas };
}

describe('session-scoped socket updates', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { hidden: false, visibilityState: 'visible' },
    });

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { href: 'http://localhost/' } },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'window');
  });

  test('an inactive session cannot change the visible run state or timeline', () => {
    const { adapters, working, timeline, deltas } = createAdapters();
    const pendingRequests = new Map();

    handleServerMessage({
      message: {
        type: 'chat_stream_chunk',
        sessionId: 'a',
        requestId: 'request-a',
        chunk: { kind: 'status', phase: 'completed', message: null },
      },
      pendingRequests,
      adapters,
    });

    handleServerMessage({
      message: {
        type: 'chat_stream_chunk',
        sessionId: 'a',
        requestId: 'request-a',
        chunk: { kind: 'text_delta', text: 'other session' },
      },
      pendingRequests,
      adapters,
    });

    handleServerMessage({
      message: { type: 'done', requestId: 'request-a' },
      pendingRequests,
      adapters,
    });

    expect(working()).toBe(true);
    expect(timeline()).toEqual([]);
    expect(deltas).toEqual([]);
  });
});
