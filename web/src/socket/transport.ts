import type {
  SocketCloseHandlers,
  SocketConnectHandlers,
  SocketState,
} from './types';

export function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  return `${protocol}//${window.location.host}/ws`;
}

export function sendSocketMessage(
  state: Pick<SocketState, 'socket'>,
  message: unknown,
): void {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket is not connected');
  }

  state.socket.send(JSON.stringify(message));
}

export function clearSocketReconnectTimer(
  state: Pick<SocketState, 'wsReconnectTimer'>,
  setReconnectTimer: (value: number | null) => void,
): void {
  if (state.wsReconnectTimer === null) {
    return;
  }

  window.clearTimeout(state.wsReconnectTimer);
  setReconnectTimer(null);
}

export function scheduleSocketReconnect(params: {
  state: Pick<SocketState, 'wsReconnectTimer'>;
  setReconnectTimer: (value: number | null) => void;
  handlers: Pick<SocketCloseHandlers, 'scheduleSocketReconnect'>;
}): void {
  params.handlers.scheduleSocketReconnect();
}

export function connectSocketTransport(params: {
  state: SocketState;
  setSocket: (socket: WebSocket | null) => void;
  handlers: SocketConnectHandlers & SocketCloseHandlers;
}): void {
  const { state, setSocket, handlers } = params;

  if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
    if (state.socket.readyState === WebSocket.OPEN) {
      handlers.setWsConnected(true);
    }

    return;
  }

  const socket = new WebSocket(getWebSocketUrl());
  setSocket(socket);

  socket.addEventListener('close', () => {
    setSocket(null);
    handlers.setWsConnected(false);
    state.pendingRequests.clear();
    handlers.setWebUiBusyCounts({});
    handlers.scheduleSocketReconnect();
  });

  socket.addEventListener('error', () => {
    handlers.setWsConnected(false);
  });
}
