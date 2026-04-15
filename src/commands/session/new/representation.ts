import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const SessionNewDataSchema = z.object({
  sessionId: z.string().min(1),
});

export const SessionNewRepresentationSchema = createRepresentationSchema(
  SessionNewDataSchema,
).extend({
  kind: z.literal('session.new'),
});

export type SessionNewRepresentation = z.infer<
  typeof SessionNewRepresentationSchema
>;
