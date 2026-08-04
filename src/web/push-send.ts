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

export type WebPushSendSummary = {
  attempted: number;
  accepted: number;
  failed: number;
  removed: number;
};

type WebPushSendOutcome = 'accepted' | 'failed' | 'removed';

const WEB_PUSH_TTL_SECONDS = 24 * 60 * 60;
const STALE_SUBSCRIPTION_STATUS_CODES = new Set([401, 403, 404, 410]);

function pushErrorDetails(err: unknown): {
  statusCode: number;
  message: string;
} {
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

  return { statusCode, message };
}

export async function notifyAllWebPushSubscriptions(
  props: NotifyAllWebPushSubscriptionsProps,
): Promise<WebPushSendSummary> {
  const { db, config, title, body, url } = props;

  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  const payload = JSON.stringify({ title, body, url });
  const subs = listWebPushSubscriptions(db);

  if (subs.length === 0) {
    debug(
      'Web push: no rows in web_push_subscriptions — open web UI, connect Nostr + WebSocket, click Push.',
    );

    return { attempted: 0, accepted: 0, failed: 0, removed: 0 };
  }

  debug(`Web push: sending to ${subs.length} subscription(s)`);

  const outcomes = await Promise.all(
    subs.map(async (sub): Promise<WebPushSendOutcome> => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: WEB_PUSH_TTL_SECONDS },
        );

        debug(
          'Web push: accepted by push service for endpoint',
          sub.endpoint.slice(0, 48),
        );

        return 'accepted';
      } catch (err) {
        const { statusCode, message } = pushErrorDetails(err);

        if (STALE_SUBSCRIPTION_STATUS_CODES.has(statusCode)) {
          deleteWebPushSubscription({ db, endpoint: sub.endpoint });
          debug(`Web push: removed stale subscription (${statusCode})`);

          return 'removed';
        }

        log.warn(`Web push failed (${statusCode || 'no status'}): ${message}`);

        return 'failed';
      }
    }),
  );

  const accepted = outcomes.filter((outcome) => outcome === 'accepted').length;
  const removed = outcomes.filter((outcome) => outcome === 'removed').length;

  return {
    attempted: subs.length,
    accepted,
    failed: subs.length - accepted,
    removed,
  };
}
