import { z } from 'zod';

import { AgentBackendNameSchema, type AgentBackendName } from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';

export const AiModelDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('show'),
    backend: AgentBackendNameSchema,
    override: z.string().nullable(),
  }),
  z.object({
    view: z.literal('cleared'),
    backend: AgentBackendNameSchema,
  }),
  z.object({
    view: z.literal('set'),
    backend: AgentBackendNameSchema,
    modelId: z.string().min(1),
  }),
]);

export const AiModelRepresentationSchema = createRepresentationSchema(
  AiModelDataSchema,
).extend({
  kind: z.literal('ai.model'),
});

export type AiModelRepresentation = z.infer<typeof AiModelRepresentationSchema>;

type BuildAiModelRepresentationProps = {
  backendName: AgentBackendName;
  selected: string | null;
  currentOverride: string | null;
};

export function buildAiModelRepresentation({
  backendName,
  selected,
  currentOverride,
}: BuildAiModelRepresentationProps): AiModelRepresentation {
  if (!selected) {
    return {
      kind: 'ai.model',
      version: 1,
      meta: { command: 'ai', subcommand: 'model' },
      data: {
        view: 'show',
        backend: backendName,
        override: currentOverride,
      },
    };
  }

  if (selected.toLowerCase() === 'reset') {
    return {
      kind: 'ai.model',
      version: 1,
      meta: { command: 'ai', subcommand: 'model' },
      data: { view: 'cleared', backend: backendName },
    };
  }

  return {
    kind: 'ai.model',
    version: 1,
    meta: { command: 'ai', subcommand: 'model' },
    data: {
      view: 'set',
      backend: backendName,
      modelId: selected,
    },
  };
}
