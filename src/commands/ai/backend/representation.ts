import { z } from 'zod';

import { AgentBackendNameSchema } from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';

export const AiBackendDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('query'),
    backend: AgentBackendNameSchema,
  }),
  z.object({
    view: z.literal('invalid-usage'),
    prefix: z.string().min(1),
    backendOpts: z.string().min(1),
  }),
  z.object({
    view: z.literal('unchanged'),
    backend: AgentBackendNameSchema,
  }),
  z.object({
    view: z.literal('switched'),
    previousBackend: AgentBackendNameSchema,
    nextBackend: AgentBackendNameSchema,
    newSessionId: z.string().min(1),
  }),
  z.object({
    view: z.literal('switched-session-failed'),
    nextBackend: AgentBackendNameSchema,
    errorMessage: z.string(),
  }),
]);

export const AiBackendRepresentationSchema = createRepresentationSchema(
  AiBackendDataSchema,
).extend({
  kind: z.literal('ai.backend'),
});

export type AiBackendRepresentation = z.infer<
  typeof AiBackendRepresentationSchema
>;
