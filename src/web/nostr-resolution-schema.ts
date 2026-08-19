import { z } from 'zod';

import { nostrEventSchema } from '@src/nostr/cache/schema';
import { normalizeRelay } from '@src/nostr/nip65';

export const MAX_NOSTR_PROFILE_POSTS_BODY_BYTES = 32 * 1024;
export const MAX_NOSTR_PROFILE_POSTS = 10;
export const MAX_NOSTR_DIRECT_REPLIES = 20;
export const MAX_NOSTR_INTERACTION_RECIPIENTS = 4;
export const MAX_NOSTR_RELAY_LENGTH = 2_048;

export const hex64Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/i)
  .transform((value) => value.toLowerCase());

export const relaySchema = z
  .string()
  .max(MAX_NOSTR_RELAY_LENGTH)
  .transform((value, ctx) => {
    const normalized = normalizeRelay(value);

    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Invalid WebSocket relay URL' });

      return z.NEVER;
    }

    return normalized;
  });

export const relayListSchema = z.array(relaySchema);

export const NostrProfilePostsRequestSchema = z
  .object({
    pubkey: hex64Schema,
    relayHints: relayListSchema,
    fallbackRelays: relayListSchema,
    limit: z.number().int().min(1).max(MAX_NOSTR_PROFILE_POSTS),
  })
  .strict();

export const NostrReplaceableRequestSchema = z
  .object({
    kind: z.union([z.literal(0), z.literal(3)]),
    pubkey: hex64Schema,
    relayHints: relayListSchema,
    fallbackRelays: relayListSchema,
    requireFresh: z.boolean(),
  })
  .strict();

export const NostrReplaceableResponseSchema = z.object({
  ok: z.literal(true),
  event: nostrEventSchema.nullable(),
});

const resolutionDiagnosticSchema = z.object({
  code: z.enum([
    'cache-hit',
    'network-hit',
    'missing',
    'invalid-request',
    'deadline',
    'network-failed',
    'refresh-scheduled',
    'refresh-coalesced',
    'refresh-completed',
    'refresh-failed',
  ]),
  attemptedGroups: z.number().int().nonnegative(),
});

const eventTargetSchema = z.object({
  type: z.literal('event'),
  eventId: hex64Schema,
  authorPubkey: hex64Schema.nullable(),
});

const addressTargetSchema = z.object({
  type: z.literal('address'),
  kind: z.number().int().nonnegative(),
  pubkey: hex64Schema,
  identifier: z.string(),
});

export const eventReferenceEdgeSchema = z.object({
  sourceEventId: hex64Schema,
  role: z.enum([
    'thread-root',
    'thread-parent',
    'embed',
    'reply-target',
    'reaction-target',
    'repost-target',
  ]),
  target: z.discriminatedUnion('type', [
    eventTargetSchema,
    addressTargetSchema,
  ]),
  relayHints: relayListSchema,
});

export const missingReferenceSchema = z.object({
  edge: eventReferenceEdgeSchema,
  reason: z.enum(['missing', 'deadline', 'network-failed']),
  diagnostic: resolutionDiagnosticSchema,
});

export const NostrProfilePostsResponseSchema = z.object({
  ok: z.literal(true),
  primaryEvents: z.array(nostrEventSchema).max(MAX_NOSTR_PROFILE_POSTS),
  graph: z.object({
    events: z.array(nostrEventSchema),
    edges: z.array(eventReferenceEdgeSchema),
    missing: z.array(missingReferenceSchema),
  }),
});

export const NostrEventContextRequestSchema = z
  .object({
    eventId: hex64Schema.nullable(),
    authorPubkey: hex64Schema.nullable(),
    address: z.string().max(4_096).nullable(),
    targetEvent: nostrEventSchema.nullable().default(null),
    relayHints: relayListSchema,
    fallbackRelays: relayListSchema,
    includeDirectReplies: z.boolean(),
    replyLimit: z.number().int().min(1).max(MAX_NOSTR_DIRECT_REPLIES),
    threadContextOnly: z.boolean().optional(),
    resolutionMode: z.enum(['persistent', 'ephemeral']).default('persistent'),
  })
  .strict()
  .refine((value) => value.eventId !== null || value.address !== null, {
    message: 'eventId or address is required',
  });

export const NostrEventContextResponseSchema = z.object({
  ok: z.literal(true),
  targetEvent: nostrEventSchema,
  targetRelayHints: relayListSchema,
  graph: z.object({
    events: z.array(nostrEventSchema),
    edges: z.array(eventReferenceEdgeSchema),
    missing: z.array(missingReferenceSchema),
  }),
  directReplies: z.array(nostrEventSchema).max(MAX_NOSTR_DIRECT_REPLIES),
  profileEvents: z.array(nostrEventSchema),
});

export const NostrInteractionRelaysRequestSchema = z
  .object({
    signerPubkey: hex64Schema,
    recipientPubkeys: z
      .array(hex64Schema)
      .max(MAX_NOSTR_INTERACTION_RECIPIENTS),
    relayHints: relayListSchema,
    fallbackRelays: relayListSchema,
  })
  .strict();

export const NostrInteractionRelaysResponseSchema = z.object({
  ok: z.literal(true),
  signerWriteRelays: relayListSchema,
  recipientReadRelays: relayListSchema,
  publishRelays: relayListSchema,
});

export type NostrProfilePostsRequest = z.infer<
  typeof NostrProfilePostsRequestSchema
>;
export type NostrReplaceableRequest = z.infer<
  typeof NostrReplaceableRequestSchema
>;
export type NostrReplaceableResponse = z.infer<
  typeof NostrReplaceableResponseSchema
>;

export type NostrProfilePostsResponse = z.infer<
  typeof NostrProfilePostsResponseSchema
>;

export type NostrEventContextRequest = z.infer<
  typeof NostrEventContextRequestSchema
>;

export type NostrEventContextResponse = z.infer<
  typeof NostrEventContextResponseSchema
>;

export type NostrInteractionRelaysRequest = z.infer<
  typeof NostrInteractionRelaysRequestSchema
>;

export type NostrInteractionRelaysResponse = z.infer<
  typeof NostrInteractionRelaysResponseSchema
>;
