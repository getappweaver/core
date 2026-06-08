import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletPayDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('invalid-amount'),
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
    view: z.literal('quote'),
    mintUrl: z.string().min(1),
    amountSats: z.number().int().positive(),
    quote: z.string().min(1),
    invoice: z.string().min(1),
    qrDataUri: z.string().min(1),
    message: z.string().min(1).nullable(),
  }),
  z.object({
    view: z.literal('success'),
    mintUrl: z.string().min(1),
    receivedSats: z.number().int().nonnegative(),
    feeSats: z.number().int().nonnegative(),
  }),
  z.object({
    view: z.literal('failure'),
    message: z.string().min(1),
  }),
]);

export const WalletPayRepresentationSchema = createRepresentationSchema(
  WalletPayDataSchema,
).extend({
  kind: z.literal('wallet.pay'),
});

export type WalletPayRepresentation = z.infer<
  typeof WalletPayRepresentationSchema
>;
