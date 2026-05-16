import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const SessionListNativeRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  directory: z.string().min(1),
  agent: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  createdAtIso: z.string().min(1),
  updatedAtIso: z.string().min(1),
  filesChanged: z.number().int().nonnegative().nullable(),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  isTracked: z.boolean(),
  isCurrent: z.boolean(),
});

export const SessionListNativeDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('backend-unsupported'),
    backend: z.string().min(1),
  }),
  z.object({
    view: z.literal('empty'),
    directory: z.string().min(1),
  }),
  z.object({
    view: z.literal('rows'),
    directory: z.string().min(1),
    rows: z.array(SessionListNativeRowSchema),
  }),
]);

export const SessionListNativeRepresentationSchema = createRepresentationSchema(
  SessionListNativeDataSchema,
).extend({
  kind: z.literal('session.list-native'),
});

export type SessionListNativeRepresentation = z.infer<
  typeof SessionListNativeRepresentationSchema
>;
