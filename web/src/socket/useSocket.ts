import { createEffect, createMemo, createSignal } from 'solid-js';

import { renderStoryListRoot } from '@src/commands/story/renderers/story-list-component';
import type { ClientViewRoot, WebNodeRoot } from '@src/web/ui-schema';

import type {
  BeginWebEntityPendingProps,
  ComposerAiState,
} from '../commands/types';
import { isWebDemoMode } from '../demo/runtime';
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
  backend: 'demo',
  currentSessionId: null,
  executionProfileLabel: 'Mode',
  executionProfileName: 'Demo',
  executionProfileColor: '#facc15',
  effectiveModel: 'demo-fixture-model',
  provider: 'AppWeaver Demo',
  modelOverride: null,
  opencodeModelFormChoices: [],
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

  const [webUiBusyCounts, setWebUiBusyCounts] = createSignal<
    Record<string, number>
  >({});

  const [webEntityPending, setWebEntityPending] = createSignal<
    Record<string, Record<string, { count: number; label: string }>>
  >({});

  const [wsReconnectNonce, setWsReconnectNonce] = createSignal(0);

  let socket: WebSocket | null = null;
  let wsReconnectTimer: number | null = null;
  const pendingRequests = new Map<string, PendingRequest>();

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
            setAgentWorking: adapters.setAgentWorking,
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

    sendSocketMessage(getState(), message);
  }

  function emitDemoMessage(message: WebSocketServerMessage): void {
    handleServerMessage({
      message,
      pendingRequests,
      adapters: {
        appendSystemMessage: adapters.appendSystemMessage,
        chat: adapters.chat,
        setAgentWorking: adapters.setAgentWorking,
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
        | { arguments?: Record<string, unknown> }
        | undefined;

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

  function loadBootstrapData(): void {
    const commandsRequestId = createRequestId();
    const timelineRequestId = createRequestId();
    const composerAiStateRequestId = createRequestId();

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

    pendingRequests.set(timelineRequestId, {
      onTimelineEventsResult: (message) => {
        if (message.timelineId !== adapters.timelineId()) {
          return;
        }

        const rawItems = message.items as TimelineItem[];
        const restoredItems = rawItems.map(restoredTimelineItem);

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

        if (restoredItems.length > 0) {
          adapters.setTimeline(restoredItems);
        }
      },
    });

    pendingRequests.set(composerAiStateRequestId, {
      onComposerAiStateResult: (message) => {
        adapters.setComposerAiState(message.state);
      },
    });

    send({
      type: 'request_commands',
      requestId: commandsRequestId,
    });

    send({
      type: 'load_timeline',
      requestId: timelineRequestId,
      timelineId: adapters.timelineId(),
      limit: 100,
    });

    send({
      type: 'request_composer_ai_state',
      requestId: composerAiStateRequestId,
    });
  }

  function requestComposerAiState(): void {
    if (!wsConnected()) {
      return;
    }

    const requestId = createRequestId();

    pendingRequests.set(requestId, {
      onComposerAiStateResult: (message) => {
        adapters.setComposerAiState(message.state);
      },
    });

    send({
      type: 'request_composer_ai_state',
      requestId,
    });
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
          setWebUiBusyCounts({});
          setWebEntityPending({});
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
            onDone: () => {
              if (
                sock !== socket ||
                !socket ||
                socket.readyState !== WebSocket.OPEN
              ) {
                return;
              }

              clearReconnectTimer();
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
        handleServerMessage({
          message: JSON.parse(String(event.data)),
          pendingRequests,
          adapters: {
            appendSystemMessage: adapters.appendSystemMessage,
            chat: adapters.chat,
            setAgentWorking: adapters.setAgentWorking,
          },
        });
      } catch (err) {
        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );
      }
    });

    socket.addEventListener('close', () => {
      const pluginInstallRestart = consumePluginInstallRestartMessage();

      if (pluginInstallRestart) {
        adapters.appendSystemMessage(pluginInstallRestart);
      }
    });

    socket.addEventListener('error', () => {
      setWsConnected(false);

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
    pendingRequests,
    requestComposerAiState,
    sendSocketMessage: send,
    useSocketLifecycle,
    webUiBusyCounts,
    webUiBusyDigest,
    wsConnected,
    wsReconnectNonce,
  };
}
