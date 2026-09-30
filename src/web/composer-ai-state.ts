import { createBackend } from '@src/backends/factory';
import { opencodeRuntimeController } from '@src/backends/opencode-runtime-controller';
import type { AiModelSourceContextUsage } from '@src/capabilities/ai-model-source.v1';
import type {
  ModelSourceOption,
  ModelSourceSnapshot,
} from '@src/core/model-source';
import { createModelSourceCoordinator } from '@src/core/model-source';
import {
  getInterventionMode,
  getWorkspaceTarget,
  type WorkspaceTarget,
} from '@src/db';
import { getOrCreateCurrentSession } from '@src/session';

import type { WebRouteContext } from './routes';
import { isSessionRunning } from './session-runs';
import { getSelectedWebSessionId } from './session-selection';

export type ComposerAiState = {
  backend: 'opencode';
  interventionAvailable: boolean;
  interventionEnabled: boolean;
  currentSessionId: string | null;
  workspace: WorkspaceTarget;
  sessionRunning: boolean;
  modelSource: ModelSourceSnapshot;
  modelSources: ModelSourceOption[];
  contextStats: AiModelSourceContextUsage | null;
};

export async function getComposerAiState(
  ctx: WebRouteContext,
  selectedSessionId: string | null,
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

  const cwd = workspace === 'appweaver' ? ctx.dmBotRoot : ctx.parentOfBotRoot;

  const selected = getSelectedWebSessionId(
    ctx.seenDb,
    selectedSessionId,
    workspace,
  );

  const currentSessionId = selected
    ? selected
    : await getOrCreateCurrentSession({
        db: ctx.seenDb,
        backend: createBackend({
          backendName: 'opencode',
          dmBotRoot: ctx.dmBotRoot,
        }),
        cwd,
        workspace,
        selection: 'web',
      });

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
    workspace,
    sessionRunning: isSessionRunning(currentSessionId),
    modelSource,
    modelSources,
    contextStats,
  };
}
