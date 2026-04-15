import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const SessionAttachDataSchema = z.discriminatedUnion('view', [
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
    view: z.literal('not-implemented'),
    targetBackend: z.enum(['cursor']),
  }),
  z.object({
    view: z.literal('success'),
    sessionId: z.string().min(1),
    attachedToBackend: z.string().min(1),
  }),
]);

export const SessionAttachRepresentationSchema = createRepresentationSchema(
  SessionAttachDataSchema,
).extend({
  kind: z.literal('session.attach'),
});

export type SessionAttachRepresentation = z.infer<
  typeof SessionAttachRepresentationSchema
>;
