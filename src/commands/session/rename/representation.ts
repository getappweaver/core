import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const SessionRenameDataSchema = z.discriminatedUnion('view', [
  z.object({ view: z.literal('usage'), prefix: z.string().min(1) }),
  z.object({
    view: z.literal('success'),
    sessionId: z.string().min(1),
    title: z.string().min(1),
  }),
]);

export const SessionRenameRepresentationSchema = createRepresentationSchema(
  SessionRenameDataSchema,
).extend({ kind: z.literal('session.rename') });

export type SessionRenameRepresentation = z.infer<
  typeof SessionRenameRepresentationSchema
>;
