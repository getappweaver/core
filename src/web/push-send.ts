// ---------------------------------------------------------------------------
// push-send.ts — Send Web Push to all stored subscriptions (VAPID)
// ---------------------------------------------------------------------------

import webPush from 'web-push';

import type { CoreDb } from '@src/db';
import type { WebPushConfig } from '@src/env';
import { debug, log } from '@src/logger';

import {
  deleteWebPushSubscription,
  listWebPushSubscriptions,
} from './push-subscriptions';

type NotifyAllWebPushSubscriptionsProps = {
  db: CoreDb;
  config: WebPushConfig;
  title: string;
  body: string;
  url: string;
};

export function notifyAllWebPushSubscriptions(
  props: NotifyAllWebPushSubscriptionsProps,
): void {
  const { db, config, title, body, url } = props;

  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  const payload = JSON.stringify({ title, body, url });
  const subs = listWebPushSubscriptions(db);

  if (subs.length === 0) {
    debug(
      'Web push: no rows in web_push_subscriptions — open web UI, connect Nostr + WebSocket, click Push.',
    );

    return;
  }

  debug(`Web push: sending to ${subs.length} subscription(s)`);

  for (const sub of subs) {
    void webPush
      .sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        { TTL: 120 },
      )
      .then(() => {
        debug('Web push: delivered OK for endpoint', sub.endpoint.slice(0, 48));
      })
      .catch((err: unknown) => {
        const statusCode =
          err &&
          typeof err === 'object' &&
          'statusCode' in err &&
          typeof (err as { statusCode: unknown }).statusCode === 'number'
            ? (err as { statusCode: number }).statusCode
            : 0;

        const message =
          err &&
          typeof err === 'object' &&
          'message' in err &&
          typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : String(err);

        if (statusCode === 410 || statusCode === 404) {
          deleteWebPushSubscription({ db, endpoint: sub.endpoint });
          debug(`Web push: removed stale subscription (${statusCode})`);
        } else {
          log.warn(
            `Web push failed (${statusCode || 'no status'}): ${message}`,
          );
        }
      });
  }
}
