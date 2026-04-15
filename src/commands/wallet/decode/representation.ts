import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletDecodeDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('result'),
    text: z.string(),
  }),
]);

export const WalletDecodeRepresentationSchema = createRepresentationSchema(
  WalletDecodeDataSchema,
).extend({
  kind: z.literal('wallet.decode'),
});

export type WalletDecodeRepresentation = z.infer<
  typeof WalletDecodeRepresentationSchema
>;
