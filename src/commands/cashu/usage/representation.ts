import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const WalletUsageDataSchema = z.object({
  prefix: z.string().min(1),
});

export const WalletUsageRepresentationSchema = createRepresentationSchema(
  WalletUsageDataSchema,
).extend({
  kind: z.literal('cashu.usage'),
});

export type WalletUsageRepresentation = z.infer<
  typeof WalletUsageRepresentationSchema
>;

type BuildWalletUsageRepresentationProps = {
  prefix: string;
};

export function buildWalletUsageRepresentation({
  prefix,
}: BuildWalletUsageRepresentationProps): WalletUsageRepresentation {
  return {
    kind: 'cashu.usage',
    version: 1,
    meta: { command: 'cashu', subcommand: 'usage' },
    data: { prefix },
  };
}
