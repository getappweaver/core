import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const SessionAdoptDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('backend-mismatch'),
    prefix: z.string().min(1),
    activeBackend: z.string().min(1),
  }),
  z.object({
    view: z.literal('not-found'),
    sessionId: z.string().min(1),
  }),
  z.object({
    view: z.literal('success'),
    sessionId: z.string().min(1),
    title: z.string().min(1),
  }),
]);

export const SessionAdoptRepresentationSchema = createRepresentationSchema(
  SessionAdoptDataSchema,
).extend({
  kind: z.literal('session.adopt'),
});

export type SessionAdoptRepresentation = z.infer<
  typeof SessionAdoptRepresentationSchema
>;
