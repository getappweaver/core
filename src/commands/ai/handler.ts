// ---------------------------------------------------------------------------
// src/commands/ai/handler.ts — ai mode, backend, model, models, provider
// ---------------------------------------------------------------------------

import { opencodeRuntimeController } from '@src/backends/opencode-runtime-controller';
import { createModelSourceCoordinator } from '@src/core/model-source';
import { getWorkspaceTarget, setRecentModelLimit } from '@src/db';

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import { renderAiCli } from './cli-representation';
import { handleAiModel } from './model/handler';
import { handleAiModels } from './models/handler';

export const handleAiRoot: BuiltinHandler = async (ctx) => {
  const p = ctx.prefix;
  const args = ctx.args;
  const sub = args[0]?.toLowerCase();

  if (sub === 'help') {
    const topic =
      args.length > 1 ? args.slice(1).join(' ').toLowerCase() : null;

    return renderBuiltinHelpText({
      prefix: p,
      root: 'ai',
      topic,
    });
  }

  if (!sub) {
    return `Usage: ${p}ai source | model | models | favorite | unfavorite | recent-limit | runtime — or ${p}ai help`;
  }

  if (sub === 'source') {
    return handleError(async () => {
      const workspace = getWorkspaceTarget(ctx.seenDb);
      const coordinator = createModelSourceCoordinator(ctx.seenDb);
      const requested = args[1]?.trim();

      if (!requested) {
        const sources = await coordinator.listSources(workspace);

        return sources
          .map(
            (source) =>
              `${source.active ? '✓ ' : '  '}${source.title} (${source.alias})${source.health.status === 'healthy' ? '' : ` — ${source.health.message}`}`,
          )
          .join('\n');
      }

      const providerId = coordinator.resolveSourceId(requested);
      const snapshot = await coordinator.setActiveSource(workspace, providerId);

      return `Active model source for ${workspace}: ${snapshot.state.title}.`;
    }, 'Failed to change model source');
  }

  if (sub === 'model') {
    return handleAiModel(ctx);
  }

  if (sub === 'models') {
    return handleError(async () => {
      const rep = await handleAiModels({
        seenDb: ctx.seenDb,
        dmBotRoot: ctx.dmBotRoot,
        attachUrl: ctx.attachUrl,
      });

      return renderAiCli(rep, { prefix: p });
    }, 'Failed to list models');
  }

  if (sub === 'favorite' || sub === 'unfavorite') {
    return handleError(async () => {
      const modelId = args[1]?.trim();

      if (!modelId) {
        return `Usage: ${p}ai ${sub} <model-id>`;
      }

      await createModelSourceCoordinator(ctx.seenDb).setFavorite(
        getWorkspaceTarget(ctx.seenDb),
        'opencode',
        modelId,
        sub === 'favorite',
      );

      return `${sub === 'favorite' ? 'Favorited' : 'Unfavorited'} ${modelId}.`;
    }, 'Failed to update favorite');
  }

  if (sub === 'recent-limit') {
    return handleError(async () => {
      const limit = Number(args[1]);
      setRecentModelLimit(ctx.seenDb, getWorkspaceTarget(ctx.seenDb), limit);

      return `Recent model limit set to ${limit}.`;
    }, 'Failed to update recent model limit');
  }

  if (sub === 'runtime') {
    return handleError(async () => {
      const action = args[1]?.toLowerCase() ?? 'status';

      if (action === 'cancel') {
        return opencodeRuntimeController.cancelPending()
          ? 'OpenCode configuration transition cancellation requested.'
          : 'No cancellable OpenCode transition is pending.';
      }

      if (action === 'retry') {
        await opencodeRuntimeController.retry();

        return 'OpenCode configuration transition completed.';
      }

      if (action === 'force-restart') {
        await opencodeRuntimeController.forceRestart();

        return 'Managed OpenCode process restarted.';
      }

      if (action !== 'status') {
        return `Usage: ${p}ai runtime [status | cancel | retry | force-restart]`;
      }

      const status = opencodeRuntimeController.status();

      return `OpenCode: ${status.state}; active runs: ${status.activeRuns}; queued runs: ${status.queuedRuns}; pending transitions: ${status.pendingTransitions}${status.lastError ? `; ${status.lastError}` : ''}`;
    }, 'OpenCode runtime action failed');
  }

  return `Usage: ${p}ai source | model | models | favorite | unfavorite | recent-limit | runtime — or ${p}ai help`;
};
