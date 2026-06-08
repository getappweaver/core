import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderSyncModelsDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('fetched'),
    discoveredProviders: z.number().int().nonnegative(),
    fetchedProviders: z.number().int().nonnegative(),
    failedProviders: z.number().int().nonnegative(),
    modelProviderRows: z.number().int().nonnegative(),
    uniqueModels: z.number().int().nonnegative(),
    fetchedAtMs: z.number(),
  }),
  z.object({
    view: z.literal('cached'),
    providerCount: z.number().int().nonnegative(),
    modelProviderRows: z.number().int().nonnegative(),
    uniqueModels: z.number().int().nonnegative(),
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
