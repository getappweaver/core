import { createModelSourceCoordinator } from '@src/core/model-source';
import { getWorkspaceTarget } from '@src/db';
import type { WebHandlerResult } from '@src/web/ui-schema';

import { handleError, type RouteCommandContext } from '../../dispatch';
import { appendStatusBlock } from '../../shared/with-status';

import { renderAiModelCli } from './renderers/cli';
import { buildAiModelRepresentation } from './representation';

export async function handleAiModel(
  ctx: RouteCommandContext,
): Promise<WebHandlerResult> {
  return handleError(async () => {
    const backendName = 'opencode' as const;
    const coordinator = createModelSourceCoordinator(ctx.seenDb);
    const workspace = getWorkspaceTarget(ctx.seenDb);

    const currentOverride = (
      await coordinator.getSnapshot(workspace, backendName)
    ).state.selectedModelId;

    const selected = ctx.args[1] ?? null;

    const rep = buildAiModelRepresentation({
      backendName,
      selected,
      currentOverride,
    });

    if (rep.data.view === 'cleared') {
      await coordinator.selectModel(workspace, backendName, null);
    }

    if (rep.data.view === 'set') {
      await coordinator.selectModel(workspace, backendName, rep.data.modelId);
    }

    const out = renderAiModelCli(rep, { prefix: ctx.prefix });

    return appendStatusBlock(ctx, out);
  }, 'Failed to set model');
}
