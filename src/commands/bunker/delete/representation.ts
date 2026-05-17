import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const BunkerDeleteDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('missing'),
    name: z.string().min(1),
  }),
  z.object({
    view: z.literal('success'),
    name: z.string().min(1),
  }),
]);

export const BunkerDeleteRepresentationSchema = createRepresentationSchema(
  BunkerDeleteDataSchema,
).extend({
  kind: z.literal('bunker.delete'),
});

export type BunkerDeleteRepresentation = z.infer<
  typeof BunkerDeleteRepresentationSchema
>;
