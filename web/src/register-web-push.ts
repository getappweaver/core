// ---------------------------------------------------------------------------
// register-web-push.ts — Subscribe this browser to AppWeaver Web Push (VAPID)
// ---------------------------------------------------------------------------

import { deleteJson, fetchJsonPublic, postJson } from './utils';

export type RegisterWebPushOutcome =
  | { status: 'ok' }
  | { status: 'disabled' }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'bad_payload' }
  | { status: 'error'; message: string };

const SW_READY_TIMEOUT_MS = 10_000;

function decodeBase64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);

  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }

  return buffer;
}

function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      const regs = await navigator.serviceWorker
        .getRegistrations()
        .catch(() => []);
      const states = regs.map(
        (r) =>
          r.active?.state ?? r.waiting?.state ?? r.installing?.state ?? 'none',
      );

      reject(
        new Error(
          `Service worker not active after ${SW_READY_TIMEOUT_MS / 1000}s. ` +
            `Registrations: ${regs.length} (${states.join(', ') || 'none'}). ` +
            'Check DevTools → Application → Service Workers and Console.',
        ),
      );
    }, SW_READY_TIMEOUT_MS);

    navigator.serviceWorker.ready.then(
      (reg) => {
        clearTimeout(timer);
        resolve(reg);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function registerWebPushNotifications(): Promise<RegisterWebPushOutcome> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return { status: 'unsupported' };
  }

  try {
    const vapid = await fetchJsonPublic<{
      enabled: boolean;
      publicKey: string | null;
    }>('/api/push/vapid-key');

    if (!vapid.enabled || !vapid.publicKey) {
      return { status: 'disabled' };
    }

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      return { status: 'denied' };
    }

    const registration = await ensureServiceWorker();

    const existing = await registration.pushManager.getSubscription();

    if (existing) {
      await existing.unsubscribe();
    }

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64UrlToArrayBuffer(vapid.publicKey),
    });
    const json = sub.toJSON();

    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { status: 'bad_payload' };
    }

    await postJson<{ ok: true }>('/api/push/subscribe', json);

    return { status: 'ok' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return { status: 'error', message };
  }
}

export async function unregisterWebPushNotifications(
  subscription: PushSubscription,
): Promise<void> {
  const json = subscription.toJSON();

  if (!json.endpoint) {
    return;
  }

  try {
    await deleteJson('/api/push/subscribe', { endpoint: json.endpoint });
  } catch {
    /* ignore */
  }

  await subscription.unsubscribe();
}
