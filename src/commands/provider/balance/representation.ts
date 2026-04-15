import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderBalanceDataSchema = z.object({
  balanceMsatsRaw: z.number().int().nonnegative(),
  budgetWasUpdated: z.boolean(),
});

export const ProviderBalanceRepresentationSchema = createRepresentationSchema(
  ProviderBalanceDataSchema,
).extend({
  kind: z.literal('provider.balance'),
});

export type ProviderBalanceRepresentation = z.infer<
  typeof ProviderBalanceRepresentationSchema
>;
