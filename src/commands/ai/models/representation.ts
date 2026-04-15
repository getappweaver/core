import { z } from 'zod';

import { AgentBackendNameSchema } from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';

export const AiModelsItemSchema = z.object({
  modelId: z.string().min(1),
  isCurrent: z.boolean(),
});

export const AiModelsDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('empty'),
    backend: AgentBackendNameSchema,
  }),
  z.object({
    view: z.literal('list'),
    backend: AgentBackendNameSchema,
    items: z.array(AiModelsItemSchema),
  }),
]);

export const AiModelsRepresentationSchema = createRepresentationSchema(
  AiModelsDataSchema,
).extend({
  kind: z.literal('ai.models'),
});

export type AiModelsRepresentation = z.infer<
  typeof AiModelsRepresentationSchema
>;
