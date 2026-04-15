import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const BunkerUsageDataSchema = z.object({});

export const BunkerUsageRepresentationSchema = createRepresentationSchema(
  BunkerUsageDataSchema,
).extend({
  kind: z.literal('bunker.usage'),
});

export type BunkerUsageRepresentation = z.infer<
  typeof BunkerUsageRepresentationSchema
>;

export function createBunkerUsageRepresentation(): BunkerUsageRepresentation {
  return {
    kind: 'bunker.usage',
    version: 1,
    meta: { command: 'bunker', subcommand: 'usage' },
    data: {},
  };
}
