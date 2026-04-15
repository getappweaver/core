import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletHistoryRowSchema = z.object({
  dateDisplay: z.string().min(1),
  operation: z.string().min(1),
  shortMint: z.string().min(1),
  amount: z.number().int(),
  fee: z.number().int(),
  token: z.string(),
});

export const WalletHistoryDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('no-wallet-db'),
  }),
  z.object({
    view: z.literal('empty'),
  }),
  z.object({
    view: z.literal('rows'),
    showToken: z.boolean(),
    rows: z.array(WalletHistoryRowSchema),
  }),
]);

export const WalletHistoryRepresentationSchema = createRepresentationSchema(
  WalletHistoryDataSchema,
).extend({
  kind: z.literal('wallet.history'),
});

export type WalletHistoryRepresentation = z.infer<
  typeof WalletHistoryRepresentationSchema
>;
