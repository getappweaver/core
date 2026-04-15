import { z } from 'zod';

import { AgentBackendNameSchema } from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';

export const SessionResumeLastDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('empty'),
    backendName: AgentBackendNameSchema,
  }),
  z.object({
    view: z.literal('success'),
    sessionId: z.string().min(1),
  }),
]);

export const SessionResumeLastRepresentationSchema = createRepresentationSchema(
  SessionResumeLastDataSchema,
).extend({
  kind: z.literal('session.resume-last'),
});

export type SessionResumeLastRepresentation = z.infer<
  typeof SessionResumeLastRepresentationSchema
>;
