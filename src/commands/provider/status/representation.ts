import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderStatusDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('no-mint'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('local'),
  }),
  z.object({
    view: z.literal('routstr'),
    sessionKeyShort: z.string().nullable(),
    mintUrl: z.string().min(1),
    budgetMsatsRaw: z.number().int().nonnegative(),
    modelId: z.string().nullable(),
  }),
]);

export const ProviderStatusRepresentationSchema = createRepresentationSchema(
  ProviderStatusDataSchema,
).extend({
  kind: z.literal('provider.status'),
});

export type ProviderStatusRepresentation = z.infer<
  typeof ProviderStatusRepresentationSchema
>;
