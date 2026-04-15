// ---------------------------------------------------------------------------
// push-schema.ts — Zod for Web Push subscription HTTP bodies
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const PushSubscriptionBodySchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const PushUnsubscribeBodySchema = z.object({
  endpoint: z.string().min(1),
});
