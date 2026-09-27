import { createModelSourceCoordinator } from '@src/core/model-source';
import { getWorkspaceTarget, type CoreDb } from '@src/db';

import type { AiModelsRepresentation } from './representation';

type HandleAiModelsProps = {
  seenDb: CoreDb;
  dmBotRoot: string;
  attachUrl: string | null;
};

export async function handleAiModels({
  seenDb,
}: HandleAiModelsProps): Promise<AiModelsRepresentation> {
  const snapshot = await createModelSourceCoordinator(seenDb).getSnapshot(
    getWorkspaceTarget(seenDb),
    'opencode',
  );

  return snapshot.models.length === 0
    ? {
        kind: 'ai.models',
        version: 1,
        meta: { command: 'ai', subcommand: 'models' },
        data: { view: 'empty', backend: 'opencode' },
      }
    : {
        kind: 'ai.models',
        version: 1,
        meta: { command: 'ai', subcommand: 'models' },
        data: {
          view: 'list',
          backend: 'opencode',
          items: snapshot.models.map((model) => ({
            modelId: model.id,
            isCurrent: model.id === snapshot.state.effectiveModelId,
          })),
        },
      };
}
