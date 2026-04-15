import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderModelsListItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  contextLength: z.number().int().positive().nullable(),
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
    updatedAtMs: z.number(),
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
