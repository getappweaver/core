import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const SessionUsageDataSchema = z.object({
  prefix: z.string().min(1),
});

export const SessionUsageRepresentationSchema = createRepresentationSchema(
  SessionUsageDataSchema,
).extend({
  kind: z.literal('session.usage'),
});

export type SessionUsageRepresentation = z.infer<
  typeof SessionUsageRepresentationSchema
>;

type BuildSessionUsageRepresentationProps = {
  prefix: string;
};

export function buildSessionUsageRepresentation({
  prefix,
}: BuildSessionUsageRepresentationProps): SessionUsageRepresentation {
  return {
    kind: 'session.usage',
    version: 1,
    meta: { command: 'session', subcommand: 'usage' },
    data: { prefix },
  };
}
