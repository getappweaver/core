import { createBackend } from '@src/backends/factory';
import {
  getAgentBackend,
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getModelOverride,
  getProviderName,
  type CoreDb,
} from '@src/db';
import { debug } from '@src/logger';

import type { AiModelsRepresentation } from './representation';

type HandleAiModelsProps = {
  seenDb: CoreDb;
  dmBotRoot: string;
  attachUrl: string | null;
};

function toRepresentation(
  data: AiModelsRepresentation['data'],
): AiModelsRepresentation {
  return {
    kind: 'ai.models',
    version: 1,
    meta: { command: 'ai', subcommand: 'models' },
    data,
  };
}

export async function handleAiModels(
  props: HandleAiModelsProps,
): Promise<AiModelsRepresentation> {
  const { seenDb, dmBotRoot, attachUrl } = props;
  const backendName = getAgentBackend(seenDb);
  const mode = getCurrentOrDefaultMode(seenDb);
  const executionProfile = getBackendExecutionProfile(seenDb, backendName);
  const modelOverride = getModelOverride(seenDb, backendName);
  const providerName = getProviderName(seenDb);

  debug(`modelOverride: ${modelOverride}`);

  const backend = createBackend({
    backendName,
    dmBotRoot,
    cursorMode: mode,
    opencodeAgentName:
      executionProfile.kind === 'opencode' ? executionProfile.agent : null,
    attachUrl,
    modelOverride,
    providerName,
  });

  const models = await backend.availableModels();

  if (models.length === 0) {
    return toRepresentation({
      view: 'empty',
      backend: backendName,
    });
  }

  return toRepresentation({
    view: 'list',
    backend: backendName,
    items: models.map((modelId) => ({
      modelId,
      isCurrent: modelId === backend.modelName,
    })),
  });
}
