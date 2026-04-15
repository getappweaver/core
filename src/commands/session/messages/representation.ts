import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const SessionMessagesLineSchema = z.object({
  role: z.string().min(1),
  contentPreview: z.string(),
});

export const SessionMessagesDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('empty'),
  }),
  z.object({
    view: z.literal('transcript'),
    lines: z.array(SessionMessagesLineSchema),
  }),
]);

export const SessionMessagesRepresentationSchema = createRepresentationSchema(
  SessionMessagesDataSchema,
).extend({
  kind: z.literal('session.messages'),
});

export type SessionMessagesRepresentation = z.infer<
  typeof SessionMessagesRepresentationSchema
>;
