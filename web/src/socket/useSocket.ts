import { createEffect, createMemo, createSignal } from 'solid-js';

import { renderStoryListRoot } from '@src/commands/story/renderers/story-list-component';
import type { ClientViewRoot, WebNodeRoot } from '@src/web/ui-schema';

import type {
  BeginWebEntityPendingProps,
  ComposerAiState,
} from '../commands/types';
import { isWebDemoMode } from '../demo/runtime';
import {
  confirmAuthenticatedProcessInstance,
  hasExpectedProcessRestart,
  markProcessRestartDisconnected,
  registerProcessRestart,
} from '../processRestartStatus';
import {
  consumePluginInstallRestartMessage,
  consumePluginInstallSuccessMessage,
  hasActivePluginInstallRestartStatus,
} from '../restartStatus';
import { logStoryDebug } from '../story/debug';
import { handleStorySandboxSocketMessage } from '../story/sandbox';
import type { CommandDetail, CommandOutput, TimelineItem } from '../types';
import { createId as createRequestId } from '../utils';
import type { WebSocketServerMessage } from '../ws-types';

import { handleServerMessage } from './dispatch';
import {
  clearSocketReconnectTimer,
  connectSocketTransport,
  sendSocketMessage,
} from './transport';
import type { PendingRequest, SocketAppAdapters, SocketState } from './types';

const WS_RECONNECT_DELAY_MS = 1500;
const COMPOSER_STATE_RETRY_DELAYS_MS = [1500, 3000, 6000, 12000];
const COMPOSER_STATE_PENDING_POLL_MS = 1500;
const TAB_SESSION_STORAGE_KEY = 'appweaver.selected-session-id';

function readTabSessionId(): string | null {
  try {
    return (
      window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY)?.trim() || null
    );
  } catch {
    return null;
  }
}

function rememberTabSessionId(sessionId: string): void {
  try {
    window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Storage is optional; the selected session remains available in memory.
  }
}

type DemoStoryEntry = {
  pluginAlias: string;
  pluginName: string;
  iconUrl?: string;
  story: {
    id: string;
    title: string;
    description?: string;
    commandOutput?: {
      text?: string;
      web?: WebNodeRoot;
      clientView?: ClientViewRoot;
    };
    sandbox?: Record<string, unknown>;
  };
};

type CommandResultTimelineItem = Extract<
  TimelineItem,
  { type: 'command_result' }
>;

type ClientMessageRecord = Record<string, unknown> & {
  requestId?: string;
  type?: string;
};

const demoComposerAiState: ComposerAiState = {
  backend: 'opencode',
  interventionAvailable: false,
  interventionEnabled: false,
  currentSessionId: null,
  workspace: 'appweaver',
  sessionRunning: false,
  currentSessionTitle: null,
  recentSessions: [],
  modelSource: {
    providerId: 'demo/ai-model-source/v1',
    state: {
      sourceId: 'demo/ai-model-source/v1',
      title: 'Demo models',
      active: true,
      transitionState: 'stable',
      health: { status: 'healthy' },
      selectedModelId: 'demo/model',
      effectiveModelId: 'demo/model',
      fallbackReason: 'selected',
      catalogRevision: 'demo-1',
    },
    models: [],
  },
  modelSources: [
    {
      providerId: 'demo/ai-model-source/v1',
      alias: 'core',
      title: 'Core models',
      active: true,
      health: { status: 'healthy' },
    },
  ],
  contextStats: null,
};

function demoAssetPath(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

async function fetchDemoJson<T>(path: string): Promise<T> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return (await response.json()) as T;
}

function storyListEntry(entry: DemoStoryEntry) {
  return {
    id: entry.story.id,
    pluginAlias: entry.pluginAlias,
    iconUrl: entry.iconUrl ?? null,
    title: entry.story.title,
    description: entry.story.description ?? null,
  };
}

function relatedStoryEntries(params: {
  stories: DemoStoryEntry[];
  entry: DemoStoryEntry;
}) {
  return params.stories
    .filter(
      (story) =>
        story.pluginAlias === params.entry.pluginAlias &&
        story.story.id !== params.entry.story.id,
    )
    .map(storyListEntry);
}

function storyStartRoot(params: {
  stories: DemoStoryEntry[];
  entry: DemoStoryEntry;
}): ClientViewRoot {
  return {
    kind: 'client_view',
    version: 1,
    view: 'story-runtime',
    meta: { command: 'story', subcommand: 'start' },
    payload: {
      id: params.entry.story.id,
      pluginAlias: params.entry.pluginAlias,
      pluginName: params.entry.pluginName,
      iconUrl: params.entry.iconUrl,
      story: params.entry.story,
      autoStart: true,
      walkthrough: false,
      relatedStories: relatedStoryEntries(params),
    },
  };
}

function restoredTimelineItem(item: TimelineItem): TimelineItem {
  if (item.type !== 'command_result') {
    return item;
  }

  if (item.clientView?.view !== 'story-runtime') {
    return item;
  }

  const payload = item.clientView.payload;

  const payloadRecord =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null;

  if (payloadRecord?.autoStart !== true) {
    return item;
  }

  return {
    ...item,
    clientView: {
      ...item.clientView,
      payload: {
        ...payloadRecord,
        autoStart: false,
      },
    },
  };
}

function isStoryRuntimeTimelineItem(
  item: TimelineItem,
): item is CommandResultTimelineItem {
  return (
    item.type === 'command_result' && item.clientView?.view === 'story-runtime'
  );
}

function firstFixtureOutput(stories: DemoStoryEntry[], key: string): unknown {
  for (const entry of stories) {
    const outputs = entry.story.sandbox?.__outputs;

    if (!outputs || typeof outputs !== 'object') {
      continue;
    }

    const value = (outputs as Record<string, unknown>)[key];

    if (Array.isArray(value) && value.length > 0) {
      return value[0];
    }
  }

  return null;
}

function relatedDemoStories(params: {
  stories: DemoStoryEntry[];
  command: string;
}): NonNullable<WebNodeRoot['widgetHelp']>['stories'] {
  return params.stories
    .filter((entry) => entry.pluginAlias === params.command)
    .map((entry) => ({
      id: entry.story.id,
      title: entry.story.title,
      description: entry.story.description,
      pluginAlias: entry.pluginAlias,
      iconUrl: entry.iconUrl,
    }));
}

function demoWidgetOutput(params: {
  stories: DemoStoryEntry[];
  command: string;
  subcommand: string;
}): CommandOutput | null {
  const output = firstFixtureOutput(
    params.stories,
    `${params.command}:${params.subcommand}`,
  );

  if (!output || typeof output !== 'object') {
    return output === null ? null : (output as CommandOutput);
  }

  const root = output as Partial<WebNodeRoot>;

  if (root.kind !== 'ui' || root.version !== 1) {
    return output as CommandOutput;
  }

  return {
    ...(output as WebNodeRoot),
    widgetHelp: root.widgetHelp
      ? {
          ...root.widgetHelp,
          stories: relatedDemoStories({
            stories: params.stories,
            command: params.command,
          }),
          defaultOpen: true,
        }
      : undefined,
  };
}

export function useSocket(adapters: SocketAppAdapters) {
  const [wsConnected, setWsConnected] = createSignal(false);
  const [modelStateUnavailable, setModelStateUnavailable] = createSignal(false);

  const [webUiBusyCounts, setWebUiBusyCounts] = createSignal<
    Record<string, number>
  >({});

  const [webEntityPending, setWebEntityPending] = createSignal<
    Record<string, Record<string, { count: number; label: string }>>
  >({});

  const [wsReconnectNonce, setWsReconnectNonce] = createSignal(0);

  let socket: WebSocket | null = null;
  let wsReconnectTimer: number | null = null;
  let composerStateRetryTimer: number | null = null;
  let composerStateRequestSequence = 0;
  let composerStateRequestInFlight = false;
  let composerStateRefreshQueued = false;
  type SessionSelection = 'current' | 'latest' | { sessionId: string };
  let queuedComposerSelection: SessionSelection = 'current';
  const lastRunningBySession = new Map<string, boolean>();
  const pendingRequests = new Map<string, PendingRequest>();
  const seenTimelineEventIds = new Set<string>();
  const sessionByRequestId = new Map<string, string>();
  let timelineCursor: { sessionId: string; cursor: number } | null = null;
  let timelineLoadRequestId: string | null = null;
  let timelineCatchUpQueued = false;

  function clearComposerStateRetry(): void {
    if (composerStateRetryTimer !== null) {
      window.clearTimeout(composerStateRetryTimer);
      composerStateRetryTimer = null;
    }
  }

  function setSocket(next: WebSocket | null): void {
    socket = next;
  }

  function setReconnectTimer(next: number | null): void {
    wsReconnectTimer = next;
  }

  function getState(): SocketState {
    return {
      socket,
      wsReconnectTimer,
      pendingRequests,
    };
  }

  function beginWebUiBusy(sourceId: string): void {
    setWebUiBusyCounts((prev) => ({
      ...prev,
      [sourceId]: (prev[sourceId] ?? 0) + 1,
    }));
  }

  function endWebUiBusy(sourceId: string): void {
    setWebUiBusyCounts((prev) => {
      const next = { ...prev };
      const n = (next[sourceId] ?? 0) - 1;

      if (n <= 0) {
        delete next[sourceId];
      } else {
        next[sourceId] = n;
      }

      return next;
    });
  }

  function isWebUiBusyFor(sourceId: string): boolean {
    return (webUiBusyCounts()[sourceId] ?? 0) > 0;
  }

  function beginWebEntityPending({
    sourceId,
    entityKey,
    label,
  }: BeginWebEntityPendingProps): void {
    setWebEntityPending((prev) => ({
      ...prev,
      [sourceId]: {
        ...(prev[sourceId] ?? {}),
        [entityKey]: {
          count: (prev[sourceId]?.[entityKey]?.count ?? 0) + 1,
          label,
        },
      },
    }));
  }

  function endWebEntityPending(sourceId: string, entityKey: string): void {
    setWebEntityPending((prev) => {
      const source = { ...(prev[sourceId] ?? {}) };
      const current = source[entityKey];

      if (!current) {
        return prev;
      }

      if (current.count <= 1) {
        delete source[entityKey];
      } else {
        source[entityKey] = { ...current, count: current.count - 1 };
      }

      const next = { ...prev };

      if (Object.keys(source).length === 0) {
        delete next[sourceId];
      } else {
        next[sourceId] = source;
      }

      return next;
    });
  }

  function getWebEntityPendingFor(sourceId: string, entityKey: string) {
    const state = webEntityPending()[sourceId]?.[entityKey];

    return {
      pending: (state?.count ?? 0) > 0,
      label: state?.label ?? null,
    };
  }

  const webUiBusyDigest = createMemo(() => JSON.stringify(webUiBusyCounts()));

  function clearReconnectTimer(): void {
    clearSocketReconnectTimer(getState(), setReconnectTimer);
  }

  function scheduleReconnect(): void {
    if (
      adapters.auth.authState().status !== 'connected' ||
      wsReconnectTimer !== null
    ) {
      return;
    }

    wsReconnectTimer = window.setTimeout(() => {
      wsReconnectTimer = null;
      setWsReconnectNonce((value) => value + 1);
    }, WS_RECONNECT_DELAY_MS);
  }

  function send(message: unknown): void {
    const handledByStorySandbox = handleStorySandboxSocketMessage({
      message,
      emit: (serverMessage) => {
        handleServerMessage({
          message: serverMessage,
          pendingRequests,
          adapters: {
            appendSystemMessage: adapters.appendSystemMessage,
            chat: adapters.chat,
            timelineId: adapters.timelineId,
            setAgentWorking: adapters.setAgentWorking,
            setTimeline: adapters.setTimeline,
            setToolInterventions: adapters.setToolInterventions,
            setPaymentRequest: adapters.setPaymentRequest,
            setPaymentStatus: adapters.setPaymentStatus,
            setComposerAiState: adapters.setComposerAiState,
          },
        });
      },
    });

    if (handledByStorySandbox) {
      return;
    }

    if (isWebDemoMode()) {
      void handleDemoSocketMessage(message).catch((err) => {
        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );
      });

      return;
    }

    const record = message as ClientMessageRecord;

    const timelineId =
      typeof record.timelineId === 'string'
        ? record.timelineId
        : sessionByRequestId.get(record.requestId ?? '');

    const answerEventId =
      record.type === 'prompt_answer' ? createRequestId() : null;

    sendSocketMessage(
      getState(),
      answerEventId ? { ...record, eventId: answerEventId } : message,
    );

    if (record.requestId && timelineId) {
      sessionByRequestId.set(record.requestId, timelineId);
    }

    if (timelineId === adapters.timelineId()) {
      if (answerEventId) {
        seenTimelineEventIds.add(answerEventId);
      } else if (
        record.requestId &&
        (record.type === 'chat' ||
          (record.type === 'run_command' && record.recordInTimeline !== false))
      ) {
        seenTimelineEventIds.add(`${record.requestId}-user`);
      }
    }
  }

  function emitDemoMessage(message: WebSocketServerMessage): void {
    handleServerMessage({
      message,
      pendingRequests,
      adapters: {
        appendSystemMessage: adapters.appendSystemMessage,
        chat: adapters.chat,
        timelineId: adapters.timelineId,
        setAgentWorking: adapters.setAgentWorking,
        setTimeline: adapters.setTimeline,
        setToolInterventions: adapters.setToolInterventions,
        setPaymentRequest: adapters.setPaymentRequest,
        setPaymentStatus: adapters.setPaymentStatus,
        setComposerAiState: adapters.setComposerAiState,
      },
    });
  }

  function emitDemoDone(requestId: string): void {
    emitDemoMessage({ type: 'done', requestId });
  }

  async function handleDemoSocketMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }

    const record = message as ClientMessageRecord;
    const requestId = record.requestId;

    if (!requestId) {
      return;
    }

    if (record.type === 'request_commands') {
      const commands = await fetchDemoJson<CommandDetail[]>(
        demoAssetPath('demo/commands.json'),
      );

      emitDemoMessage({ type: 'commands_result', requestId, commands });
      emitDemoDone(requestId);

      return;
    }

    if (record.type === 'load_timeline') {
      emitDemoMessage({
        type: 'timeline_events_result',
        requestId,
        timelineId:
          typeof record.timelineId === 'string'
            ? record.timelineId
            : adapters.timelineId(),
        items: [],
        hasMore: false,
        firstUnreadId: null,
      });

      emitDemoDone(requestId);

      return;
    }

    if (record.type === 'request_composer_ai_state') {
      emitDemoMessage({
        type: 'composer_ai_state_result',
        requestId,
        state: demoComposerAiState,
      });

      emitDemoDone(requestId);

      return;
    }

    if (
      record.type === 'delete_timeline_event' ||
      record.type === 'save_timeline_form'
    ) {
      emitDemoDone(requestId);

      return;
    }

    if (record.type !== 'run_command') {
      emitDemoMessage({
        type: 'error',
        requestId,
        message: 'Demo mode does not support this socket action.',
      });

      return;
    }

    const command = typeof record.command === 'string' ? record.command : '';

    const subcommand =
      typeof record.subcommand === 'string' ? record.subcommand : '';

    const stories = await fetchDemoJson<DemoStoryEntry[]>(
      demoAssetPath('demo/stories.json'),
    );

    if (command === 'story' && subcommand === 'list') {
      emitDemoMessage({
        type: 'command_result',
        requestId,
        output: renderStoryListRoot(
          stories.map((entry) => ({
            id: entry.story.id,
            pluginAlias: entry.pluginAlias,
            iconUrl: entry.iconUrl ?? null,
            title: entry.story.title,
            description: entry.story.description ?? null,
          })),
        ),
      });

      emitDemoDone(requestId);

      return;
    }

    if (command === 'story' && subcommand === 'start') {
      const payload = record.payload as
        { arguments?: Record<string, unknown> } | undefined;

      const storyId = payload?.arguments?.id;
      const story = stories.find((entry) => entry.story.id === storyId);

      if (!story) {
        emitDemoMessage({
          type: 'error',
          requestId,
          message: `Unknown story: ${String(storyId ?? '')}`,
        });

        return;
      }

      emitDemoMessage({
        type: 'command_result',
        requestId,
        output: storyStartRoot({ stories, entry: story }),
      });

      emitDemoDone(requestId);

      return;
    }

    const output = demoWidgetOutput({ stories, command, subcommand });

    if (output) {
      emitDemoMessage({
        type: 'command_result',
        requestId,
        output,
      });

      emitDemoDone(requestId);

      return;
    }

    emitDemoMessage({
      type: 'error',
      requestId,
      message: `Demo fixture not available for /${command} ${subcommand}.`,
    });
  }

  function loadSessionTimeline(sessionId: string): void {
    if (sessionId !== adapters.timelineId()) {
      return;
    }

    if (timelineLoadRequestId !== null) {
      timelineCatchUpQueued = true;

      return;
    }

    const timelineRequestId = createRequestId();

    const afterCursor =
      timelineCursor?.sessionId === sessionId ? timelineCursor.cursor : null;

    let catchUpHasMore = false;
    timelineLoadRequestId = timelineRequestId;

    pendingRequests.set(timelineRequestId, {
      onTimelineEventsResult: (message) => {
        if (
          timelineLoadRequestId !== timelineRequestId ||
          message.timelineId !== sessionId ||
          sessionId !== adapters.timelineId()
        ) {
          return;
        }

        const rawItems = message.items as TimelineItem[];
        const restoredItems = rawItems.map(restoredTimelineItem);

        for (const item of restoredItems) {
          if (item.type === 'command_result' && item.clientView) {
            registerProcessRestart(item.clientView);
          }
        }

        if (message.cursor !== undefined) {
          timelineCursor = { sessionId, cursor: message.cursor };

          catchUpHasMore =
            afterCursor !== null &&
            message.hasMore &&
            message.cursor > afterCursor;
        }

        const firstUnreadId = restoredItems.some(
          (item) => item.id === message.firstUnreadId,
        )
          ? message.firstUnreadId
          : null;

        const storyRuntimeItems = restoredItems.flatMap((item, index) =>
          isStoryRuntimeTimelineItem(item)
            ? [
                {
                  item,
                  rawItem: rawItems[index] ?? item,
                },
              ]
            : [],
        );

        if (storyRuntimeItems.length > 0) {
          logStoryDebug('timeline.restore-story-runtimes', {
            timelineId: message.timelineId,
            count: storyRuntimeItems.length,
            items: storyRuntimeItems.map(({ item, rawItem }) => {
              const payload = item.clientView?.payload;

              const rawPayload = isStoryRuntimeTimelineItem(rawItem)
                ? rawItem.clientView?.payload
                : null;

              const payloadRecord =
                typeof payload === 'object' && payload !== null
                  ? (payload as Record<string, unknown>)
                  : null;

              return {
                id: item.id,
                command: item.command,
                subcommand: item.subcommand,
                storyId: payloadRecord?.id ?? null,
                autoStart: payloadRecord?.autoStart ?? null,
                restoredAutoStartDisabled: payload !== rawPayload,
                walkthrough: payloadRecord?.walkthrough ?? null,
              };
            }),
          });
        }

        if (afterCursor === null) {
          adapters.setFirstUnreadId(firstUnreadId);
        }

        const appendHistory =
          afterCursor === null
            ? adapters.setTimeline
            : adapters.appendTimelineCatchUp;

        appendHistory((current: TimelineItem[]) => {
          const currentIds = new Set(current.map((item) => item.id));

          const currentToolCallIds = new Set(
            current.flatMap((item) =>
              item.type === 'tool' ? [item.tool.callId] : [],
            ),
          );

          const added = restoredItems.filter((item) => {
            const alreadyDisplayed =
              seenTimelineEventIds.has(item.id) ||
              currentIds.has(item.id) ||
              (item.type === 'tool' &&
                currentToolCallIds.has(item.tool.callId));

            seenTimelineEventIds.add(item.id);

            return !alreadyDisplayed;
          });

          if (added.length === 0) {
            return current;
          }

          // Initial history precedes restored widgets and any live activity.
          return afterCursor === null
            ? [...added, ...current]
            : [...current, ...added];
        });

        const acknowledgeRead = () => {
          if (isWebDemoMode() || document.visibilityState !== 'visible') {
            return;
          }

          const latestAssistant = restoredItems.findLast(
            (item) => item.type === 'chat' && item.role === 'assistant',
          );

          send({
            type: 'mark_session_read',
            requestId: createRequestId(),
            sessionId,
            messageId: latestAssistant?.id ?? null,
          });
        };

        if (afterCursor === null && firstUnreadId) {
          adapters.focusUnreadDivider(sessionId, acknowledgeRead);
        } else if (!message.firstUnreadId) {
          acknowledgeRead();
        }
      },
      onDone: () => {
        if (timelineLoadRequestId !== timelineRequestId) {
          return;
        }

        timelineLoadRequestId = null;
        const catchUpAgain = catchUpHasMore || timelineCatchUpQueued;
        timelineCatchUpQueued = false;

        if (catchUpAgain && sessionId === adapters.timelineId()) {
          loadSessionTimeline(sessionId);
        }
      },
      onError: () => {
        if (timelineLoadRequestId === timelineRequestId) {
          timelineLoadRequestId = null;
          timelineCatchUpQueued = false;
        }
      },
    });

    try {
      send({
        type: 'load_timeline',
        requestId: timelineRequestId,
        timelineId: sessionId,
        afterCursor,
        limit: 100,
      });
    } catch (err) {
      timelineLoadRequestId = null;
      timelineCatchUpQueued = false;
      pendingRequests.delete(timelineRequestId);
      throw err;
    }
  }

  function loadBootstrapData(): void {
    const commandsRequestId = createRequestId();

    pendingRequests.set(commandsRequestId, {
      onCommandsResult: (message) => {
        adapters.setCommands(message.commands);
      },
      onDone: () => {
        adapters.setLoadingCommands(false);
      },
      onError: (message) => {
        adapters.appendSystemMessage(message.message);
        adapters.setLoadingCommands(false);
      },
    });

    send({
      type: 'request_commands',
      requestId: commandsRequestId,
    });

    if (adapters.timelineId()) {
      loadSessionTimeline(adapters.timelineId());
    }

    requestComposerAiState();
  }

  function requestComposerAiStateAttempt(
    attempt: number,
    sequence: number,
    selection: SessionSelection,
  ): void {
    if (!wsConnected()) {
      return;
    }

    const requestId = createRequestId();

    pendingRequests.set(requestId, {
      onComposerAiStateResult: (message) => {
        if (sequence !== composerStateRequestSequence) {
          return;
        }

        composerStateRequestInFlight = false;
        clearComposerStateRetry();
        setModelStateUnavailable(false);

        adapters.setComposerAiState({
          ...message.state,
          currentSessionTitle: message.state.currentSessionTitle ?? null,
          recentSessions: message.state.recentSessions ?? [],
        });

        adapters.setAgentWorking(message.state.sessionRunning);

        const sessionId =
          message.state.currentSessionId ?? (isWebDemoMode() ? 'demo' : null);

        if (sessionId && !isWebDemoMode()) {
          rememberTabSessionId(sessionId);
        }

        const wasRunning = sessionId
          ? lastRunningBySession.get(sessionId)
          : undefined;

        if (sessionId) {
          lastRunningBySession.set(sessionId, message.state.sessionRunning);
        }

        if (
          sessionId &&
          (sessionId !== adapters.timelineId() || !adapters.timelineId())
        ) {
          timelineCursor = null;
          timelineLoadRequestId = null;
          timelineCatchUpQueued = false;
          seenTimelineEventIds.clear();
          adapters.setTimelineId(sessionId);
          loadSessionTimeline(sessionId);
        } else if (sessionId && wasRunning && !message.state.sessionRunning) {
          loadSessionTimeline(sessionId);
        }

        if (composerStateRefreshQueued) {
          composerStateRefreshQueued = false;
          const nextSelection = queuedComposerSelection;
          queuedComposerSelection = 'current';
          requestComposerAiState(nextSelection);

          return;
        }

        if (
          message.state.sessionRunning ||
          message.state.modelSource.state.transitionState === 'pending'
        ) {
          composerStateRetryTimer = window.setTimeout(
            () => {
              composerStateRetryTimer = null;
              requestComposerAiStateAttempt(0, sequence, 'current');
            },
            message.state.sessionRunning
              ? 2500
              : COMPOSER_STATE_PENDING_POLL_MS,
          );
        }
      },
      onError: () => {
        if (sequence !== composerStateRequestSequence) {
          return;
        }

        composerStateRequestInFlight = false;

        if (composerStateRefreshQueued) {
          composerStateRefreshQueued = false;
          const nextSelection = queuedComposerSelection;
          queuedComposerSelection = 'current';
          requestComposerAiState(nextSelection);

          return;
        }

        const delay = COMPOSER_STATE_RETRY_DELAYS_MS[attempt];

        if (delay === undefined) {
          setModelStateUnavailable(true);

          return;
        }

        composerStateRetryTimer = window.setTimeout(() => {
          composerStateRetryTimer = null;
          requestComposerAiStateAttempt(attempt + 1, sequence, selection);
        }, delay);
      },
      suppressErrorUi: true,
    });

    try {
      composerStateRequestInFlight = true;

      send({
        type: 'request_composer_ai_state',
        requestId,
        sessionId:
          selection === 'latest'
            ? null
            : typeof selection === 'object'
              ? selection.sessionId
              : adapters.timelineId() || readTabSessionId(),
      });
    } catch {
      composerStateRequestInFlight = false;
      pendingRequests.delete(requestId);
      setModelStateUnavailable(true);
    }
  }

  function requestComposerAiState(
    selection: SessionSelection = 'current',
  ): void {
    clearComposerStateRetry();
    setModelStateUnavailable(false);

    if (composerStateRequestInFlight) {
      composerStateRefreshQueued = true;

      if (selection !== 'current') {
        queuedComposerSelection = selection;
      }

      return;
    }

    composerStateRequestSequence += 1;
    requestComposerAiStateAttempt(0, composerStateRequestSequence, selection);
  }

  function connectSocket(): void {
    if (isWebDemoMode()) {
      clearReconnectTimer();
      setWsConnected(true);
      loadBootstrapData();

      return;
    }

    connectSocketTransport({
      state: getState(),
      setSocket,
      handlers: {
        setWsConnected,
        clearWebPendingState: () => {
          timelineLoadRequestId = null;
          timelineCatchUpQueued = false;
          sessionByRequestId.clear();
          for (const requestId of pendingRequests.keys()) {
            adapters.chat.clearRequest(requestId);
          }

          clearComposerStateRetry();
          composerStateRequestSequence += 1;
          composerStateRequestInFlight = false;
          composerStateRefreshQueued = false;
          queuedComposerSelection = 'current';
          setWebUiBusyCounts({});
          setWebEntityPending({});
          adapters.setPaymentRequest(null);
          adapters.setPaymentStatus(null);
        },
        scheduleSocketReconnect: () => {
          if (adapters.auth.authState().status === 'connected') {
            scheduleReconnect();
          }
        },
      },
    });

    if (!socket) {
      return;
    }

    socket.addEventListener('open', () => {
      void (async () => {
        try {
          const sock = socket;
          const wsSignUrl = new URL('/ws', window.location.origin).href;
          const rawToken = await adapters.auth.getNip98Token(wsSignUrl, 'GET');

          if (!rawToken) {
            adapters.appendSystemMessage(
              'WebSocket: could not get NIP-98 token (connect Nostr first).',
            );

            sock?.close();
            setWsConnected(false);

            return;
          }

          const authRequestId = createRequestId();

          pendingRequests.set(authRequestId, {
            onDone: (message) => {
              if (
                sock !== socket ||
                !socket ||
                socket.readyState !== WebSocket.OPEN
              ) {
                return;
              }

              clearReconnectTimer();
              confirmAuthenticatedProcessInstance(message.instanceId ?? null);
              setWsConnected(true);

              const pluginInstallSuccess = consumePluginInstallSuccessMessage();

              if (pluginInstallSuccess) {
                adapters.appendSystemMessage(pluginInstallSuccess);
              }

              try {
                loadBootstrapData();
              } catch (err) {
                adapters.setLoadingCommands(false);

                adapters.appendSystemMessage(
                  err instanceof Error ? err.message : String(err),
                );
              }
            },
          });

          try {
            send({
              type: 'authenticate',
              requestId: authRequestId,
              authorization: `Nostr ${rawToken}`,
            });
          } catch (err) {
            pendingRequests.delete(authRequestId);

            adapters.appendSystemMessage(
              err instanceof Error ? err.message : String(err),
            );

            sock?.close();
            setWsConnected(false);
          }
        } catch (err) {
          adapters.appendSystemMessage(
            err instanceof Error
              ? `WebSocket auth failed: ${err.message}`
              : `WebSocket auth failed: ${String(err)}`,
          );

          socket?.close();
          setWsConnected(false);
        }
      })();
    });

    socket.addEventListener('message', (event) => {
      try {
        const serverMessage = JSON.parse(
          String(event.data),
        ) as WebSocketServerMessage;

        const pending = pendingRequests.get(serverMessage.requestId);

        if (
          serverMessage.type === 'command_result' &&
          typeof serverMessage.output !== 'string' &&
          serverMessage.output.kind === 'client_view'
        ) {
          registerProcessRestart(serverMessage.output);
        }

        if (
          pending &&
          sessionByRequestId.get(serverMessage.requestId) ===
            adapters.timelineId()
        ) {
          const eventId =
            serverMessage.type === 'chat_result' && pending.onChatResult
              ? serverMessage.eventId
              : ((serverMessage.type === 'command_result' &&
                    pending.onCommandResult) ||
                    (serverMessage.type === 'prompt' && pending.onPrompt)) &&
                  'timelineEventId' in serverMessage
                ? serverMessage.timelineEventId
                : null;

          if (eventId) {
            seenTimelineEventIds.add(eventId);
          }
        }

        if (
          serverMessage.type === 'chat_result' &&
          serverMessage.sessionId === adapters.timelineId() &&
          !isWebDemoMode() &&
          document.visibilityState === 'visible'
        ) {
          send({
            type: 'mark_session_read',
            requestId: createRequestId(),
            sessionId: serverMessage.sessionId,
            messageId: serverMessage.eventId,
          });
        }

        handleServerMessage({
          message: serverMessage,
          pendingRequests,
          adapters: {
            appendSystemMessage: adapters.appendSystemMessage,
            chat: adapters.chat,
            timelineId: adapters.timelineId,
            setAgentWorking: adapters.setAgentWorking,
            setTimeline: adapters.setTimeline,
            setToolInterventions: adapters.setToolInterventions,
            setPaymentRequest: adapters.setPaymentRequest,
            setPaymentStatus: adapters.setPaymentStatus,
            setComposerAiState: adapters.setComposerAiState,
          },
        });

        if (serverMessage.type === 'done' || serverMessage.type === 'error') {
          sessionByRequestId.delete(serverMessage.requestId);
        }
      } catch (err) {
        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );
      }
    });

    socket.addEventListener('close', () => {
      markProcessRestartDisconnected();

      if (hasExpectedProcessRestart()) {
        return;
      }

      const pluginInstallRestart = consumePluginInstallRestartMessage();

      if (pluginInstallRestart) {
        adapters.appendSystemMessage(pluginInstallRestart);
      }
    });

    socket.addEventListener('error', () => {
      setWsConnected(false);
      markProcessRestartDisconnected();

      if (hasExpectedProcessRestart()) {
        return;
      }

      const pluginInstallRestart = consumePluginInstallRestartMessage();

      if (pluginInstallRestart) {
        adapters.appendSystemMessage(pluginInstallRestart);

        return;
      }

      if (hasActivePluginInstallRestartStatus()) {
        return;
      }

      adapters.appendSystemMessage('WebSocket connection failed.');
    });
  }

  function disconnectSocket(): void {
    clearReconnectTimer();
    clearComposerStateRetry();
    composerStateRequestSequence += 1;
    composerStateRequestInFlight = false;
    composerStateRefreshQueued = false;

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
      socket = null;
    }

    setWsConnected(false);
    adapters.setAgentWorking(false);
  }

  function useSocketLifecycle(): void {
    createEffect(() => {
      wsReconnectNonce();

      if (adapters.auth.authState().status !== 'connected') {
        disconnectSocket();

        return;
      }

      connectSocket();
    });
  }

  return {
    beginWebEntityPending,
    beginWebUiBusy,
    connectSocket,
    disconnectSocket,
    endWebEntityPending,
    endWebUiBusy,
    getWebEntityPendingFor,
    isWebUiBusyFor,
    modelStateUnavailable,
    pendingRequests,
    loadSessionTimeline,
    requestComposerAiState,
    sendSocketMessage: send,
    useSocketLifecycle,
    webUiBusyCounts,
    webUiBusyDigest,
    wsConnected,
    wsReconnectNonce,
  };
}
