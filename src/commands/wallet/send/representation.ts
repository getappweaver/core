import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletSendDataSchema = z.discriminatedUnion('view', [
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
    view: z.literal('token'),
    token: z.string().min(1),
  }),
  z.object({
    view: z.literal('failure'),
    message: z.string().min(1),
  }),
]);

export const WalletSendRepresentationSchema = createRepresentationSchema(
  WalletSendDataSchema,
).extend({
  kind: z.literal('wallet.send'),
});

export type WalletSendRepresentation = z.infer<
  typeof WalletSendRepresentationSchema
>;
