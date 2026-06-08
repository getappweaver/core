import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletMeltDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('invalid-amount'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('invoice-form'),
    mintUrl: z.string().min(1),
    amountSats: z.number().int().positive(),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('no-wallet-db'),
  }),
  z.object({
    view: z.literal('no-mnemonic'),
  }),
  z.object({
    view: z.literal('no-mint'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('success'),
    mintUrl: z.string().min(1),
    paidSats: z.number().int().nonnegative(),
    feeSats: z.number().int().nonnegative(),
    quote: z.string().min(1),
    paymentPreimage: z.string().min(1).nullable(),
  }),
  z.object({
    view: z.literal('failure'),
    message: z.string().min(1),
  }),
]);

export const WalletMeltRepresentationSchema = createRepresentationSchema(
  WalletMeltDataSchema,
).extend({
  kind: z.literal('wallet.melt'),
});

export type WalletMeltRepresentation = z.infer<
  typeof WalletMeltRepresentationSchema
>;
