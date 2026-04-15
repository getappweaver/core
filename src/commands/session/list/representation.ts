import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const SessionListRowSchema = z.object({
  id: z.string().min(1),
  backend: z.string().min(1),
  createdAtIso: z.string().min(1),
  isCurrent: z.boolean(),
});

export const SessionListDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('empty'),
  }),
  z.object({
    view: z.literal('rows'),
    rows: z.array(SessionListRowSchema),
  }),
]);

export const SessionListRepresentationSchema = createRepresentationSchema(
  SessionListDataSchema,
).extend({
  kind: z.literal('session.list'),
});

export type SessionListRepresentation = z.infer<
  typeof SessionListRepresentationSchema
>;
