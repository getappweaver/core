import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletListDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('no-wallet-db'),
  }),
  z.object({
    view: z.literal('list'),
    defaultMintUrl: z.string().min(1).nullable(),
    totalSats: z.number().int().nonnegative(),
    items: z.array(
      z.object({
        mintUrl: z.string().min(1),
        totalSats: z.number().int().nonnegative(),
        isDefault: z.boolean(),
      }),
    ),
  }),
]);

export const WalletListRepresentationSchema = createRepresentationSchema(
  WalletListDataSchema,
).extend({
  kind: z.literal('wallet.list'),
});

export type WalletListRepresentation = z.infer<
  typeof WalletListRepresentationSchema
>;
