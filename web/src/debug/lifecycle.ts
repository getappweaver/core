const DEBUG_QUERY_PARAM = 'debugLifecycle';
const DEBUG_STORAGE_KEY = 'appweaverDebugLifecycle';
const DEBUG_LOG_STORAGE_KEY = 'appweaverLifecycleLog';
const MAX_STORED_LOGS = 200;

type LifecycleDetails = Record<string, unknown>;
type StoredLifecycleLog = {
  event: string;
  details: LifecycleDetails;
  hidden: boolean;
  href: string;
  time: string;
  visibilityState: DocumentVisibilityState;
};

function readQueryDebugFlag(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(DEBUG_QUERY_PARAM);
  } catch {
    return null;
  }
}

export function isLifecycleDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const queryFlag = readQueryDebugFlag();

  if (queryFlag === '1' || queryFlag === 'true') {
    try {
      window.localStorage.setItem(DEBUG_STORAGE_KEY, '1');
    } catch {
      // Ignore storage failures; query param still enables this load.
    }

    return true;
  }

  if (queryFlag === '0' || queryFlag === 'false') {
    try {
      window.localStorage.removeItem(DEBUG_STORAGE_KEY);
    } catch {
      // Ignore storage failures; query param still disables this load.
    }

    return false;
  }

  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function logLifecycle(
  event: string,
  details: LifecycleDetails = {},
): void {
  if (!isLifecycleDebugEnabled()) {
    return;
  }

  const entry = {
    ...details,
    href: window.location.href,
    hidden: document.hidden,
    time: new Date().toISOString(),
    visibilityState: document.visibilityState,
  };

  storeLifecycleLog({
    event,
    details,
    hidden: entry.hidden,
    href: entry.href,
    time: entry.time,
    visibilityState: entry.visibilityState,
  });

  console.warn('[appweaver:lifecycle]', event, entry);
}

function readStoredLifecycleLogs(): StoredLifecycleLog[] {
  try {
    const raw = window.localStorage.getItem(DEBUG_LOG_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed) ? (parsed as StoredLifecycleLog[]) : [];
  } catch {
    return [];
  }
}

function storeLifecycleLog(entry: StoredLifecycleLog): void {
  try {
    const logs = [...readStoredLifecycleLogs(), entry].slice(-MAX_STORED_LOGS);

    window.localStorage.setItem(DEBUG_LOG_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // Ignore storage failures; console logging is still useful.
  }
}

function describeNavigation(): LifecycleDetails {
  const entry = performance.getEntriesByType('navigation')[0];

  if (!entry || !('type' in entry)) {
    return {};
  }

  const navigation = entry as PerformanceNavigationTiming;

  return {
    navigationType: navigation.type,
    transferSize: navigation.transferSize,
    encodedBodySize: navigation.encodedBodySize,
    decodedBodySize: navigation.decodedBodySize,
  };
}

function logServiceWorkerRegistration(
  registration: ServiceWorkerRegistration,
): void {
  logLifecycle('serviceWorker.registration', {
    active: registration.active?.scriptURL ?? null,
    installing: registration.installing?.scriptURL ?? null,
    waiting: registration.waiting?.scriptURL ?? null,
  });

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;

    logLifecycle('serviceWorker.updatefound', {
      scriptURL: installing?.scriptURL ?? null,
      state: installing?.state ?? null,
    });

    installing?.addEventListener('statechange', () => {
      logLifecycle('serviceWorker.installing.statechange', {
        scriptURL: installing.scriptURL,
        state: installing.state,
      });
    });
  });
}

export function installLifecycleDebugLogger(): void {
  if (!isLifecycleDebugEnabled()) {
    return;
  }

  logLifecycle('install', describeNavigation());

  console.info(
    '[appweaver:lifecycle] stored logs: JSON.parse(localStorage.getItem("appweaverLifecycleLog") || "[]")',
  );

  window.addEventListener('beforeunload', () => {
    logLifecycle('beforeunload');
  });

  window.addEventListener('unload', () => {
    logLifecycle('unload');
  });

  window.addEventListener('pagehide', (event) => {
    logLifecycle('pagehide', { persisted: event.persisted });
  });

  window.addEventListener('pageshow', (event) => {
    logLifecycle('pageshow', { persisted: event.persisted });
  });

  document.addEventListener('visibilitychange', () => {
    logLifecycle('visibilitychange', {
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener('focus', () => {
    logLifecycle('focus');
  });

  window.addEventListener('blur', () => {
    logLifecycle('blur');
  });

  document.addEventListener('freeze', () => {
    logLifecycle('freeze');
  });

  document.addEventListener('resume', () => {
    logLifecycle('resume');
  });

  window.addEventListener('error', (event) => {
    logLifecycle('error', {
      colno: event.colno,
      filename: event.filename,
      lineno: event.lineno,
      message: event.message,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logLifecycle('unhandledrejection', {
      reason:
        event.reason instanceof Error ? event.reason.message : event.reason,
    });
  });

  if (!('serviceWorker' in navigator)) {
    logLifecycle('serviceWorker.unsupported');

    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    logLifecycle('serviceWorker.controllerchange', {
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
    });
  });

  navigator.serviceWorker
    .getRegistration()
    .then((registration) => {
      if (!registration) {
        logLifecycle('serviceWorker.registration.missing');

        return;
      }

      logServiceWorkerRegistration(registration);
    })
    .catch((error: unknown) => {
      logLifecycle('serviceWorker.registration.error', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
}
