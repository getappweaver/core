import { log } from './logger';
import { PROCESS_INSTANCE_ID } from './process-instance';
import type { ClientViewRoot } from './web/ui-schema';

type RestartListener = (view: ClientViewRoot) => void;

const listeners = new Set<RestartListener>();

export function watchProcessRestarts(listener: RestartListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Announce only after the restart request has been written successfully. */
export function announceProcessRestart(): ClientViewRoot {
  const view: ClientViewRoot = {
    kind: 'client_view',
    version: 1,
    view: 'process-restart',
    meta: { command: 'bot', subcommand: 'restart' },
    payload: { instanceId: PROCESS_INSTANCE_ID, requestedAt: Date.now() },
  };

  for (const listener of listeners) {
    try {
      listener(view);
    } catch (error) {
      log.warn(`[restart] Could not announce restart: ${String(error)}`);
    }
  }

  return view;
}
