import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderRefundDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('no-mint'),
  }),
  z.object({
    view: z.literal('no-mnemonic'),
  }),
  z.object({
    view: z.literal('no-provider-db'),
  }),
  z.object({
    view: z.literal('no-sk-key'),
  }),
  z.object({
    view: z.literal('success'),
    sats: z.number().int().nonnegative(),
  }),
]);

export const ProviderRefundRepresentationSchema = createRepresentationSchema(
  ProviderRefundDataSchema,
).extend({
  kind: z.literal('provider.refund'),
});

export type ProviderRefundRepresentation = z.infer<
  typeof ProviderRefundRepresentationSchema
>;
