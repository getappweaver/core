import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderAddModelDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('not-found'),
    modelId: z.string().min(1),
  }),
  z.object({
    view: z.literal('success'),
    modelId: z.string().min(1),
    isUpdate: z.boolean(),
    entryPrettyJson: z.string().min(1),
  }),
]);

export const ProviderAddModelRepresentationSchema = createRepresentationSchema(
  ProviderAddModelDataSchema,
).extend({
  kind: z.literal('provider.add-model'),
});

export type ProviderAddModelRepresentation = z.infer<
  typeof ProviderAddModelRepresentationSchema
>;
