import { z } from 'zod';

import { ProviderNameSchema } from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';

export const ProviderStatusDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('status'),
    providerName: ProviderNameSchema,
    sessionKeyShort: z.string().nullable(),
    hasSessionKey: z.boolean(),
    budgetMsatsRaw: z.number().int().nonnegative(),
    routstrBalanceMsatsRaw: z.number().int().nonnegative().nullable(),
    routstrBalanceError: z.string().nullable(),
    modelId: z.string().nullable(),
    hasMnemonic: z.boolean(),
    hasWalletDb: z.boolean(),
    defaultMintUrl: z.string().nullable(),
    walletTotalSats: z.number().int().nonnegative(),
    walletMints: z.array(
      z.object({
        mintUrl: z.string().min(1),
        totalSats: z.number().int().nonnegative(),
        isDefault: z.boolean(),
      }),
    ),
  }),
]);

export const ProviderStatusRepresentationSchema = createRepresentationSchema(
  ProviderStatusDataSchema,
).extend({
  kind: z.literal('provider.status'),
});

export type ProviderStatusRepresentation = z.infer<
  typeof ProviderStatusRepresentationSchema
>;
