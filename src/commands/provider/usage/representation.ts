import { z } from 'zod';

import { ProviderNameSchema } from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';

export const ProviderUsageDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('index'),
    providerName: ProviderNameSchema,
    budgetMsatsRaw: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    view: z.literal('commands-only'),
    prefix: z.string().min(1),
  }),
]);

export const ProviderUsageRepresentationSchema = createRepresentationSchema(
  ProviderUsageDataSchema,
).extend({
  kind: z.literal('provider.usage'),
});

export type ProviderUsageRepresentation = z.infer<
  typeof ProviderUsageRepresentationSchema
>;

type BuildProviderIndexRepresentationProps = {
  providerName: z.infer<typeof ProviderNameSchema>;
  budgetMsatsRaw: number | null;
};

export function buildProviderIndexRepresentation({
  providerName,
  budgetMsatsRaw,
}: BuildProviderIndexRepresentationProps): ProviderUsageRepresentation {
  return {
    kind: 'provider.usage',
    version: 1,
    meta: { command: 'provider', subcommand: 'index' },
    data: {
      view: 'index',
      providerName,
      budgetMsatsRaw,
    },
  };
}

type BuildProviderCommandsOnlyUsageProps = {
  prefix: string;
};

export function buildProviderCommandsOnlyUsage({
  prefix,
}: BuildProviderCommandsOnlyUsageProps): ProviderUsageRepresentation {
  return {
    kind: 'provider.usage',
    version: 1,
    meta: { command: 'provider', subcommand: 'usage' },
    data: { view: 'commands-only', prefix },
  };
}
