import { createSignal } from 'solid-js';

import type { ClientViewRoot } from '@src/web/ui-schema';

export type ProcessRestartPayload = {
  instanceId: string;
  requestedAt: number;
};

const EXPECTED_RESTART_MAX_AGE_MS = 120_000;
const WAITING_AFTER_MS = 15_000;
const [instanceId, setInstanceId] = createSignal<string | null>(null);
const [disconnected, setDisconnected] = createSignal(false);
const [now, setNow] = createSignal(Date.now());
const pending = new Map<string, ProcessRestartPayload>();
let timer: number | null = null;

export function parseProcessRestartPayload(
  value: unknown,
): ProcessRestartPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Partial<ProcessRestartPayload>;

  return typeof payload.instanceId === 'string' &&
    payload.instanceId.length > 0 &&
    typeof payload.requestedAt === 'number' &&
    Number.isFinite(payload.requestedAt)
    ? { instanceId: payload.instanceId, requestedAt: payload.requestedAt }
    : null;
}

function clearFinishedRestarts(): void {
  for (const [key, payload] of pending) {
    if (
      (instanceId() !== null && payload.instanceId !== instanceId()) ||
      Date.now() - payload.requestedAt >= EXPECTED_RESTART_MAX_AGE_MS
    ) {
      pending.delete(key);
    }
  }

  if (pending.size === 0 && timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function registerProcessRestart(view: ClientViewRoot): void {
  if (view.view !== 'process-restart') {
    return;
  }

  const payload = parseProcessRestartPayload(view.payload);

  if (!payload) {
    return;
  }

  pending.set(`${payload.instanceId}:${payload.requestedAt}`, payload);
  setNow(Date.now());
  clearFinishedRestarts();

  if (pending.size > 0 && timer === null) {
    timer = window.setInterval(() => {
      setNow(Date.now());
      clearFinishedRestarts();
    }, 1000);
  }
}

export function confirmAuthenticatedProcessInstance(id: string | null): void {
  if (id !== null) {
    setInstanceId(id);
  }

  setDisconnected(false);
  setNow(Date.now());
  clearFinishedRestarts();
}

export function markProcessRestartDisconnected(): void {
  setDisconnected(true);
  setNow(Date.now());
}

export function hasExpectedProcessRestart(): boolean {
  clearFinishedRestarts();

  return pending.size > 0;
}

export function processRestartMessage(payload: ProcessRestartPayload): string {
  if (instanceId() !== null && instanceId() !== payload.instanceId) {
    return 'Restarted';
  }

  if (now() - payload.requestedAt >= WAITING_AFTER_MS) {
    return 'Waiting for the bot to reconnect…';
  }

  return disconnected()
    ? 'Restarting…'
    : 'Restart requested. The bot will restart shortly.';
}
