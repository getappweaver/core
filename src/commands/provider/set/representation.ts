import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ProviderSetDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
    providerOpts: z.string().min(1),
  }),
  z.object({
    view: z.literal('invalid'),
    name: z.string(),
    providerOpts: z.string().min(1),
  }),
  z.object({
    view: z.literal('local'),
  }),
  z.object({
    view: z.literal('routstr'),
    sessionKeyPreview: z.string().nullable(),
    hasSessionKey: z.boolean(),
  }),
]);

export const ProviderSetRepresentationSchema = createRepresentationSchema(
  ProviderSetDataSchema,
).extend({
  kind: z.literal('provider.set'),
});

export type ProviderSetRepresentation = z.infer<
  typeof ProviderSetRepresentationSchema
>;
