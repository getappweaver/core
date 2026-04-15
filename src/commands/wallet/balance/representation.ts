import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletBalanceDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('no-wallet-db'),
  }),
  z.object({
    view: z.literal('no-mint'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('ok'),
    mintUrl: z.string().min(1),
    balanceSats: z.number().int().nonnegative(),
  }),
]);

export const WalletBalanceRepresentationSchema = createRepresentationSchema(
  WalletBalanceDataSchema,
).extend({
  kind: z.literal('wallet.balance'),
});

export type WalletBalanceRepresentation = z.infer<
  typeof WalletBalanceRepresentationSchema
>;
