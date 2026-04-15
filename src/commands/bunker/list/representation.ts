import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const BunkerListItemSchema = z.object({
  name: z.string().min(1),
  userPubkey: z.string().min(1),
  remoteSignerPubkey: z.string().min(1),
  relays: z.array(z.string()),
  createdAtMs: z.number(),
});

export const BunkerListDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('empty'),
  }),
  z.object({
    view: z.literal('list'),
    items: z.array(BunkerListItemSchema),
  }),
]);

export const BunkerListRepresentationSchema = createRepresentationSchema(
  BunkerListDataSchema,
).extend({
  kind: z.literal('bunker.list'),
});

export type BunkerListRepresentation = z.infer<
  typeof BunkerListRepresentationSchema
>;

export type BunkerListItem = z.infer<typeof BunkerListItemSchema>;
