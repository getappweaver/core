import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderModelsListItemSchema = z.object({
  id: z.string().min(1),
  providerCount: z.number().int().nonnegative(),
  cheapestInputPrice: z.number().nullable(),
  cheapestOutputPrice: z.number().nullable(),
  cheapestRequestPrice: z.number().nullable(),
  newestFetchedAtMs: z.number(),
});

export const ProviderModelsProviderItemSchema = z.object({
  providerKey: z.string().min(1),
  providerPubkey: z.string().min(1),
  providerD: z.string().min(1),
  endpointUrl: z.string().min(1),
  modelName: z.string().nullable(),
  contextLength: z.number().int().positive().nullable(),
  inputPrice: z.string().nullable(),
  outputPrice: z.string().nullable(),
  requestPrice: z.string().nullable(),
  fetchedAtMs: z.number(),
});

export const ProviderModelsDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('empty-no-cache'),
  }),
  z.object({
    view: z.literal('empty-filter'),
    filter: z.string().min(1),
  }),
  z.object({
    view: z.literal('list'),
    filter: z.string(),
    items: z.array(ProviderModelsListItemSchema),
    newestFetchedAtMs: z.number(),
  }),
  z.object({
    view: z.literal('model-providers'),
    modelId: z.string().min(1),
    providers: z.array(ProviderModelsProviderItemSchema),
    newestFetchedAtMs: z.number(),
  }),
]);

export const ProviderModelsRepresentationSchema = createRepresentationSchema(
  ProviderModelsDataSchema,
).extend({
  kind: z.literal('provider.models'),
});

export type ProviderModelsRepresentation = z.infer<
  typeof ProviderModelsRepresentationSchema
>;
