import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const BunkerAddDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('duplicate'),
    name: z.string().min(1),
  }),
  z.object({
    view: z.literal('success'),
    name: z.string().min(1),
    userPubkey: z.string().min(1),
    remoteSignerPubkey: z.string().min(1),
    relays: z.array(z.string()),
  }),
]);

export const BunkerAddRepresentationSchema = createRepresentationSchema(
  BunkerAddDataSchema,
).extend({
  kind: z.literal('bunker.add'),
});

export type BunkerAddRepresentation = z.infer<
  typeof BunkerAddRepresentationSchema
>;
