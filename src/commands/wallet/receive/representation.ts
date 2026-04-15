import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletReceiveDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
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
  }),
  z.object({
    view: z.literal('failure'),
    message: z.string().min(1),
  }),
]);

export const WalletReceiveRepresentationSchema = createRepresentationSchema(
  WalletReceiveDataSchema,
).extend({
  kind: z.literal('wallet.receive'),
});

export type WalletReceiveRepresentation = z.infer<
  typeof WalletReceiveRepresentationSchema
>;
