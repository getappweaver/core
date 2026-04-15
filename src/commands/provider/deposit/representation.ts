import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderDepositDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('no-mint'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('no-mnemonic'),
  }),
  z.object({
    view: z.literal('no-provider-db'),
  }),
  z.object({
    view: z.literal('no-wallet-db'),
  }),
  z.object({
    view: z.literal('insufficient-balance'),
    balanceSats: z.number().int().nonnegative(),
    mintUrl: z.string().min(1),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('no-session-key'),
  }),
  z.object({
    view: z.literal('success'),
    wasNew: z.boolean(),
    amountSats: z.number().int().positive(),
    skPreview: z.string().min(1),
  }),
]);

export const ProviderDepositRepresentationSchema = createRepresentationSchema(
  ProviderDepositDataSchema,
).extend({
  kind: z.literal('provider.deposit'),
});

export type ProviderDepositRepresentation = z.infer<
  typeof ProviderDepositRepresentationSchema
>;
