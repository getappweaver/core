// ---------------------------------------------------------------------------
// push-subscriptions.ts — Web Push subscription rows (SQLite)
// ---------------------------------------------------------------------------

import type { CoreDb } from '@src/db';

export type WebPushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: number;
  userAgent: string | null;
};

export function createWebPushSubscriptionTables(db: CoreDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS web_push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      user_agent TEXT
    )
  `);
}

type UpsertWebPushSubscriptionProps = {
  db: CoreDb;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

export function upsertWebPushSubscription(
  props: UpsertWebPushSubscriptionProps,
): void {
  const { db, endpoint, p256dh, auth, userAgent } = props;
  const createdAt = Date.now();

  db.run(
    `INSERT INTO web_push_subscriptions (endpoint, p256dh, auth, created_at, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       created_at = excluded.created_at,
       user_agent = excluded.user_agent`,
    [endpoint, p256dh, auth, createdAt, userAgent],
  );
}

type DeleteWebPushSubscriptionProps = {
  db: CoreDb;
  endpoint: string;
};

export function deleteWebPushSubscription(
  props: DeleteWebPushSubscriptionProps,
): void {
  const { db, endpoint } = props;

  db.run('DELETE FROM web_push_subscriptions WHERE endpoint = ?', [endpoint]);
}

export function listWebPushSubscriptions(
  db: CoreDb,
): WebPushSubscriptionRecord[] {
  const rows = db
    .query(
      'SELECT endpoint, p256dh, auth, created_at, user_agent FROM web_push_subscriptions',
    )
    .all() as Array<{
    endpoint: string;
    p256dh: string;
    auth: string;
    created_at: number;
    user_agent: string | null;
  }>;

  return rows.map((r) => ({
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    createdAt: r.created_at,
    userAgent: r.user_agent,
  }));
}
