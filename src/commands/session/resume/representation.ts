import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const SessionResumeDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('not-found'),
  }),
  z.object({
    view: z.literal('success'),
    sessionId: z.string().min(1),
  }),
]);

export const SessionResumeRepresentationSchema = createRepresentationSchema(
  SessionResumeDataSchema,
).extend({
  kind: z.literal('session.resume'),
});

export type SessionResumeRepresentation = z.infer<
  typeof SessionResumeRepresentationSchema
>;
