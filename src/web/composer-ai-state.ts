import { opencodeRuntimeController } from '@src/backends/opencode-runtime-controller';
import type { AiModelSourceContextUsage } from '@src/capabilities/ai-model-source.v1';
import type {
  ModelSourceOption,
  ModelSourceSnapshot,
} from '@src/core/model-source';
import { createModelSourceCoordinator } from '@src/core/model-source';
import {
  getInterventionMode,
  getState,
  getWorkspaceTarget,
  STATE_CURRENT_SESSION,
} from '@src/db';

import type { WebRouteContext } from './routes';

export type ComposerAiState = {
  backend: 'opencode';
  interventionAvailable: boolean;
  interventionEnabled: boolean;
  currentSessionId: string | null;
  modelSource: ModelSourceSnapshot;
  modelSources: ModelSourceOption[];
  contextStats: AiModelSourceContextUsage | null;
};

export async function getComposerAiState(
  ctx: WebRouteContext,
): Promise<ComposerAiState> {
  const workspace = getWorkspaceTarget(ctx.seenDb);

  const coordinator = createModelSourceCoordinator(ctx.seenDb);

  const modelSource = await coordinator.getSnapshot(workspace, 'opencode');
  const modelSources = await coordinator.listSources(workspace, modelSource);

  const runtime = opencodeRuntimeController.status();

  if (runtime.state !== 'running') {
    modelSource.state.transitionState =
      runtime.state === 'failed' ? 'failed' : 'pending';

    modelSource.state.health =
      runtime.state === 'failed'
        ? {
            status: 'unavailable',
            message: runtime.lastError ?? 'OpenCode restart failed.',
          }
        : {
            status: 'degraded',
            message: 'Waiting for OpenCode configuration restart.',
          };
  }

  const currentSessionId = getState(ctx.seenDb, STATE_CURRENT_SESSION);

  const contextStats =
    currentSessionId && runtime.state === 'running'
      ? await coordinator
          .getContextUsage({
            workspaceTarget: workspace,
            backend: 'opencode',
            providerId: modelSource.providerId,
            sessionId: currentSessionId,
            modelId: modelSource.state.effectiveModelId,
          })
          .catch(() => null)
      : null;

  return {
    backend: 'opencode',
    interventionAvailable: ctx.attachUrl === null,
    interventionEnabled: getInterventionMode(ctx.seenDb),
    currentSessionId,
    modelSource,
    modelSources,
    contextStats,
  };
}
