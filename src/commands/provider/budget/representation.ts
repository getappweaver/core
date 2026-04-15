import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderBudgetDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
    currentBudgetMsatsRaw: z.number().int().nonnegative(),
  }),
  z.object({
    view: z.literal('set'),
    budgetMsatsRaw: z.number().int().nonnegative(),
  }),
]);

export const ProviderBudgetRepresentationSchema = createRepresentationSchema(
  ProviderBudgetDataSchema,
).extend({
  kind: z.literal('provider.budget'),
});

export type ProviderBudgetRepresentation = z.infer<
  typeof ProviderBudgetRepresentationSchema
>;
