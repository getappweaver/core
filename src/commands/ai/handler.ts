// ---------------------------------------------------------------------------
// src/commands/ai/handler.ts — ai mode, backend, model, models, provider
// ---------------------------------------------------------------------------

import { debug } from '@src/logger';

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';
import { appendStatusBlock } from '../shared/with-status';

import { handleAiAgentsDelete } from './agent/delete/handler';
import { handleAiAgentsEdit } from './agent/edit/handler';
import { handleAiAgents } from './agent/modal/handler';
import { handleAiAgentsNew } from './agent/new/handler';
import { handleAiAgentRestore } from './agent/restore/handler';
import { handleAiAgentsSave } from './agent/save/handler';
import { handleAiAgentSet } from './agent/set/handler';
import { handleAiAgentsUpsertJson } from './agent/upsert-json/handler';
import { handleAiBackend } from './backend/handler';
import { renderAiCli } from './cli-representation';
import { handleAiMode } from './mode/handler';
import { handleAiModel } from './model/handler';
import { handleAiModels } from './models/handler';
import { handleAiProvider } from './provider/handler';
import { handleAiRootModel } from './root-model/handler';

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
    return `Usage: ${p}ai mode | backend | model | models | provider | agents — or ${p}ai help`;
  }

  if (sub === 'mode') {
    return handleAiMode(ctx);
  }

  if (sub === 'backend') {
    return handleError(async () => {
      const rep = await handleAiBackend({
        db: ctx.seenDb,
        dmBotRoot: ctx.dmBotRoot,
        parentOfBotRoot: ctx.parentOfBotRoot,
        attachUrl: ctx.attachUrl,
        selected: args[1],
        prefix: p,
      });

      const out = renderAiCli(rep, { prefix: p });

      return appendStatusBlock(ctx, out);
    }, 'Failed to switch backend');
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

  if (sub === 'agents') {
    const nested = args[1]?.toLowerCase() ?? null;

    if (!nested || nested === 'modal') {
      return handleError(
        async () =>
          handleAiAgents({
            seenDb: ctx.seenDb,
            dmBotRoot: ctx.dmBotRoot,
          }),
        'Failed to open agent manager',
      );
    }

    if (nested === 'set') {
      return handleError(async () => {
        const out = handleAiAgentSet({
          seenDb: ctx.seenDb,
          name: args[2],
        });

        return appendStatusBlock(ctx, out);
      }, 'Failed to set agent');
    }

    if (nested === 'restore') {
      return handleError(async () => {
        const out = await handleAiAgentRestore({
          dmBotRoot: ctx.dmBotRoot,
          seenDb: ctx.seenDb,
        });

        return appendStatusBlock(ctx, out);
      }, 'Failed to restore default agents');
    }

    if (nested === 'delete') {
      return handleError(async () => {
        const out = await handleAiAgentsDelete({
          dmBotRoot: ctx.dmBotRoot,
          seenDb: ctx.seenDb,
          name: args[2],
        });

        return appendStatusBlock(ctx, out);
      }, 'Failed to delete agent');
    }

    if (nested === 'new') {
      return handleError(async () => {
        return handleAiAgentsNew({
          dmBotRoot: ctx.dmBotRoot,
          args: args.slice(2),
        });
      }, 'Failed to save agent');
    }

    if (nested === 'edit') {
      return handleError(async () => {
        return handleAiAgentsEdit({
          dmBotRoot: ctx.dmBotRoot,
          args: args.slice(2),
        });
      }, 'Failed to save agent');
    }

    if (nested === 'save') {
      return handleError(async () => {
        const out = await handleAiAgentsSave({
          dmBotRoot: ctx.dmBotRoot,
          seenDb: ctx.seenDb,
          draft: ctx.jsonPayload,
        });

        return appendStatusBlock(ctx, out);
      }, 'Failed to save agents config');
    }

    if (nested === 'upsert-json') {
      debug('agents upsert-json', ctx.jsonPayload);

      return handleError(async () => {
        const out = await handleAiAgentsUpsertJson({
          dmBotRoot: ctx.dmBotRoot,
          payload: ctx.jsonPayload,
        });

        return appendStatusBlock(ctx, out);
      }, 'Failed to save agent');
    }

    return `Usage: ${p}ai agents modal | set | restore | new | edit | delete`;
  }

  if (sub === 'root-model') {
    return handleError(async () => {
      const out = await handleAiRootModel({
        dmBotRoot: ctx.dmBotRoot,
        selected: args[1],
      });

      return appendStatusBlock(ctx, out);
    }, 'Failed to update root model');
  }

  if (sub === 'provider') {
    return handleAiProvider(ctx);
  }

  return `Usage: ${p}ai mode | backend | model | models | provider | agents — or ${p}ai help`;
};
