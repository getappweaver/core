import { AiModelSourceV1 } from '@src/capabilities/ai-model-source.v1';
import { defineCapabilityProvider } from '@src/capabilities/types';
import type { CoreDb } from '@src/db';

import { CoreModelSourceAdapter } from './core-adapter';

export function createCoreModelSourceProvider(props: {
  db: CoreDb;
  dmBotRoot: string;
  parentOfBotRoot: string;
}) {
  const adapter = new CoreModelSourceAdapter(props);

  return defineCapabilityProvider({
    contract: AiModelSourceV1,
    operations: {
      'capability:v1:ai-model-source.get-state': async ({ input }) => ({
        state: await adapter.getState(input),
      }),
      'capability:v1:ai-model-source.list-models': ({ input }) =>
        adapter.getSnapshot(input),
      'capability:v1:ai-model-source.get-context-usage': async ({ input }) => ({
        usage: await adapter.getContextUsage(input),
      }),
      'capability:v1:ai-model-source.select-model': async ({ input }) => ({
        state: await adapter.selectModel(input, input.modelId),
      }),
      'capability:v1:ai-model-source.set-favorite': async ({ input }) => {
        await adapter.setFavorite(input, input.modelId, input.favorite);

        return adapter.getSnapshot(input);
      },
      'capability:v1:ai-model-source.record-use': ({ input }) => {
        adapter.recordUse(input, input.modelId, input.usedAt);

        return { recorded: true };
      },
      'capability:v1:ai-model-source.preflight': async ({ input }) => {
        const model = (await adapter.listModels(input)).find(
          (candidate) => candidate.id === input.modelId,
        );

        return model?.availability.status === 'available'
          ? { ready: true as const }
          : {
              ready: false as const,
              reason:
                model?.availability.status === 'unavailable'
                  ? model.availability.reason
                  : `Model is not in the active catalog: ${input.modelId}`,
            };
      },
      'capability:v1:ai-model-source.get-runtime-config': ({ input }) => ({
        config: { kind: 'canonical-model' as const, model: input.modelId },
      }),
    },
  });
}
