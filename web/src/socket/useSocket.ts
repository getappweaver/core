import { createEffect, createMemo, createSignal } from 'solid-js';

import {
  consumePluginInstallRestartMessage,
  consumePluginInstallSuccessMessage,
  hasActivePluginInstallRestartStatus,
} from '../restartStatus';
import { handleStorySandboxSocketMessage } from '../story/sandbox';
import type { TimelineItem } from '../types';
import { createId as createRequestId } from '../utils';

import { handleServerMessage } from './dispatch';
import {
  clearSocketReconnectTimer,
  connectSocketTransport,
  sendSocketMessage,
} from './transport';
import type { PendingRequest, SocketAppAdapters, SocketState } from './types';

const WS_RECONNECT_DELAY_MS = 1500;

export function useSocket(adapters: SocketAppAdapters) {
  const [wsConnected, setWsConnected] = createSignal(false);

  const [webUiBusyCounts, setWebUiBusyCounts] = createSignal<
    Record<string, number>
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

    sendSocketMessage(getState(), message);
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

        if (message.items.length > 0) {
          adapters.setTimeline(message.items as TimelineItem[]);
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
    connectSocketTransport({
      state: getState(),
      setSocket,
      handlers: {
        setWsConnected,
        setWebUiBusyCounts,
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
    beginWebUiBusy,
    connectSocket,
    disconnectSocket,
    endWebUiBusy,
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
