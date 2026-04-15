import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletMintDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('current'),
    mintUrl: z.string().min(1),
  }),
  z.object({
    view: z.literal('hint-no-mint'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('set'),
    mintUrl: z.string().min(1),
  }),
]);

export const WalletMintRepresentationSchema = createRepresentationSchema(
  WalletMintDataSchema,
).extend({
  kind: z.literal('wallet.mint'),
});

export type WalletMintRepresentation = z.infer<
  typeof WalletMintRepresentationSchema
>;
