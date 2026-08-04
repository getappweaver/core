import { notifyAllWebPushSubscriptions } from '@src/web/push-send';

import type { RouteCommandContext } from '../../dispatch';

export async function handleBotPush(ctx: RouteCommandContext): Promise<string> {
  const message = ctx.args.slice(1).join(' ').trim();

  if (message.length === 0) {
    return `Usage: ${ctx.prefix}bot push <message> — sends a test Web Push to every stored subscription.`;
  }

  if (ctx.config.webPush === null) {
    return 'Web Push is not configured. Set BOT_WEB_PUSH_PUBLIC_KEY, BOT_WEB_PUSH_PRIVATE_KEY, and BOT_WEB_PUSH_SUBJECT in .env, then restart the bot.';
  }

  const summary = await notifyAllWebPushSubscriptions({
    db: ctx.seenDb,
    config: ctx.config.webPush,
    title: 'AppWeaver (test)',
    body: message,
    url: '/',
  });

  if (summary.attempted === 0) {
    return 'No Web Push subscriptions in the database. In the web UI: connect Nostr (NIP-98 for /api), wait for the WebSocket, click Push, allow notifications, and confirm POST /api/push/subscribe returns 200 (401 means wrong signer or missing auth). GET /api/push/status shows subscriptionCount when it worked.';
  }

  const preview = message.length > 120 ? `${message.slice(0, 120)}…` : message;

  return `Web Push test completed for ${summary.attempted} subscription(s): ${summary.accepted} accepted by push service, ${summary.failed} failed, ${summary.removed} stale removed. Title: AppWeaver (test). Body: ${preview}`;
}
