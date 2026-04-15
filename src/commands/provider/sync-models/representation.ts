import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderSyncModelsDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('fetched'),
  }),
  z.object({
    view: z.literal('cached'),
    count: z.number().int().nonnegative(),
    updatedAtMs: z.number(),
  }),
]);

export const ProviderSyncModelsRepresentationSchema =
  createRepresentationSchema(ProviderSyncModelsDataSchema).extend({
    kind: z.literal('provider.sync-models'),
  });

export type ProviderSyncModelsRepresentation = z.infer<
  typeof ProviderSyncModelsRepresentationSchema
>;
