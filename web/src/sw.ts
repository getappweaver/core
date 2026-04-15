/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

precacheAndRoute(self.__WB_MANIFEST);
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

    data = { body: text ?? 'dm-bot' };
  }

  const title = data.title ?? 'dm-bot';
  const body = data.body ?? 'New activity';
  const url = data.url ?? '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
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
