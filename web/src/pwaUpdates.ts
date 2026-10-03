import { createSignal } from 'solid-js';
import { registerSW } from 'virtual:pwa-register';

import { logLifecycle } from './debug/lifecycle';

const [pwaUpdateReady, setPwaUpdateReady] = createSignal(false);
const [pwaReloading, setPwaReloading] = createSignal(false);
let registration: ServiceWorkerRegistration | null = null;

export { pwaUpdateReady, pwaReloading };

export function registerPwaUpdates(): void {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      setPwaUpdateReady(true);
      logLifecycle('pwa.needRefresh');
    },
    // A different window can activate an update. Keep this window intact too.
    onNeedReload() {
      setPwaUpdateReady(true);
      logLifecycle('pwa.reloadDeferred');
    },
    onOfflineReady() {
      logLifecycle('pwa.offlineReady');
    },
    onRegisterError(error) {
      logLifecycle('pwa.registerError', {
        message: error instanceof Error ? error.message : String(error),
      });
    },
    onRegisteredSW(scriptUrl, registered) {
      registration = registered ?? null;

      if (registered?.waiting) {
        setPwaUpdateReady(true);
      }

      logLifecycle('pwa.registered', {
        scriptUrl,
        active: registered?.active?.scriptURL ?? null,
        installing: registered?.installing?.scriptURL ?? null,
        waiting: registered?.waiting?.scriptURL ?? null,
      });
    },
  });
}

function activateWaitingWorker(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', finish);
      resolve();
    };

    const timer = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', finish);

      reject(
        new Error('App update activation timed out. Try reloading again.'),
      );
    }, 15_000);

    navigator.serviceWorker.addEventListener('controllerchange', finish);

    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', finish);
      reject(error);
    }
  });
}

export async function reloadPwaManually(): Promise<void> {
  if (pwaReloading()) {
    return;
  }

  setPwaReloading(true);

  try {
    if (registration?.waiting) {
      await activateWaitingWorker(registration.waiting);
    }

    logLifecycle('pwa.manualReload');
    window.location.reload();
  } catch (error) {
    setPwaReloading(false);
    throw error;
  }
}
