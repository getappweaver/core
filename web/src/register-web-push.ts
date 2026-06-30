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
  | { status: 'error'; message: string; stage: RegisterWebPushStage };

export type RegisterWebPushStage =
  | 'vapid_key'
  | 'permission'
  | 'service_worker'
  | 'existing_subscription'
  | 'browser_push_service'
  | 'save_subscription';

type RegisterWebPushErrorOutcome = Extract<
  RegisterWebPushOutcome,
  { status: 'error' }
>;

const SW_READY_TIMEOUT_MS = 10_000;

function decodeBase64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);

  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }

  return out;
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

function errorOutcome(
  stage: RegisterWebPushStage,
  err: unknown,
): RegisterWebPushErrorOutcome {
  return {
    status: 'error',
    stage,
    message: err instanceof Error ? err.message : String(err),
  };
}

function isErrorOutcome(value: unknown): value is RegisterWebPushErrorOutcome {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'error'
  );
}

export async function registerWebPushNotifications(): Promise<RegisterWebPushOutcome> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return { status: 'unsupported' };
  }

  const vapid = await fetchJsonPublic<{
    enabled: boolean;
    publicKey: string | null;
  }>('/api/push/vapid-key').catch((err: unknown) =>
    errorOutcome('vapid_key', err),
  );

  if (isErrorOutcome(vapid)) {
    return vapid;
  }

  if (!vapid.enabled || !vapid.publicKey) {
    return { status: 'disabled' };
  }

  const permission = await Notification.requestPermission().catch(
    (err: unknown) => errorOutcome('permission', err),
  );

  if (isErrorOutcome(permission)) {
    return permission;
  }

  if (permission !== 'granted') {
    return { status: 'denied' };
  }

  const registration = await ensureServiceWorker().catch((err: unknown) =>
    errorOutcome('service_worker', err),
  );

  if (isErrorOutcome(registration)) {
    return registration;
  }

  const existing = await registration.pushManager
    .getSubscription()
    .catch((err: unknown) => errorOutcome('existing_subscription', err));

  if (isErrorOutcome(existing)) {
    return existing;
  }

  if (existing) {
    const unsubscribed = await existing
      .unsubscribe()
      .catch((err: unknown) => errorOutcome('existing_subscription', err));

    if (isErrorOutcome(unsubscribed)) {
      return unsubscribed;
    }
  }

  const sub = await registration.pushManager
    .subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64UrlToUint8Array(vapid.publicKey),
    })
    .catch((err: unknown) => errorOutcome('browser_push_service', err));

  if (isErrorOutcome(sub)) {
    return sub;
  }

  const json = sub.toJSON();

  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { status: 'bad_payload' };
  }

  const saved = await postJson<{ ok: true }>('/api/push/subscribe', json).catch(
    (err: unknown) => errorOutcome('save_subscription', err),
  );

  if (isErrorOutcome(saved)) {
    return saved;
  }

  return { status: 'ok' };
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
