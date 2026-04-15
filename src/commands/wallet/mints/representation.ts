import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletMintsDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('no-wallet-db'),
  }),
  z.object({
    view: z.literal('list'),
    items: z.array(
      z.object({
        mintUrl: z.string().min(1),
        totalSats: z.number().int().nonnegative(),
      }),
    ),
  }),
]);

export const WalletMintsRepresentationSchema = createRepresentationSchema(
  WalletMintsDataSchema,
).extend({
  kind: z.literal('wallet.mints'),
});

export type WalletMintsRepresentation = z.infer<
  typeof WalletMintsRepresentationSchema
>;
