/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

clientsClaim();
self.skipWaiting();

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

precacheAndRoute(self.__WB_MANIFEST, {
  // Chrome installability checks and app launches may append a `source` query param.
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^source$/],
});
cleanupOutdatedCaches();

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
};

self.addEventListener('push', (event: PushEvent) => {
  let data: PushPayload = {};

  try {
    if (event.data) {
      data = event.data.json() as PushPayload;
    }
  } catch {
    const text = event.data?.text();

    data = { body: text ?? 'AppWeaver' };
  }

  const title = data.title ?? 'AppWeaver';
  const body = data.body ?? 'New activity';
  const url = data.url ?? '/';

  const iconUrl = new URL('/appweaver-pwa-192.png', self.location.origin).href;
  const badgeUrl = new URL('/appweaver-pwa-192.png', self.location.origin).href;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: iconUrl,
      badge: badgeUrl,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (
            client.url.startsWith(self.location.origin) &&
            'focus' in client
          ) {
            void (client as WindowClient).focus();

            return;
          }
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
