import { getAgentBackend, getModelOverride, setModelOverride } from '@src/db';
import type { WebNodeRoot } from '@src/web/ui-schema';

import type { RouteCommandContext } from '../../dispatch';
import { handleError } from '../../dispatch';
import { appendStatusBlock } from '../../shared/with-status';

import { renderAiModelCli } from './renderers/cli';
import { buildAiModelRepresentation } from './representation';

export async function handleAiModel(
  ctx: RouteCommandContext,
): Promise<string | WebNodeRoot> {
  return handleError(async () => {
    const backendName = getAgentBackend(ctx.seenDb);
    const currentOverride = getModelOverride(ctx.seenDb, backendName);
    const selected = ctx.args[1] ?? null;

    const rep = buildAiModelRepresentation({
      backendName,
      selected,
      currentOverride,
    });

    if (rep.data.view === 'cleared') {
      setModelOverride(ctx.seenDb, backendName, null);
    }

    if (rep.data.view === 'set') {
      setModelOverride(ctx.seenDb, backendName, rep.data.modelId);
    }

    const out = renderAiModelCli(rep, { prefix: ctx.prefix });

    return appendStatusBlock(ctx, out);
  }, 'Failed to set model');
}
