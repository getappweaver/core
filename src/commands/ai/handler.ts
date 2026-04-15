// ---------------------------------------------------------------------------
// src/commands/ai/handler.ts — ai mode, backend, model, models, provider
// ---------------------------------------------------------------------------

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';
import { appendStatusBlock } from '../shared/with-status';

import { handleAiBackend } from './backend/handler';
import { renderAiCli } from './cli-representation';
import { handleAiMode } from './mode/handler';
import { handleAiModel } from './model/handler';
import { handleAiModels } from './models/handler';
import { handleAiProvider } from './provider/handler';

export const handleAiRoot: BuiltinHandler = async (ctx) => {
  const p = ctx.prefix;
  const args = ctx.args;
  const sub = args[0]?.toLowerCase();

  if (sub === 'help') {
    const topic = args[1]?.toLowerCase() ?? null;

    return renderBuiltinHelpText({
      prefix: p,
      root: 'ai',
      topic,
    });
  }

  if (!sub) {
    return `Usage: ${p}ai mode | backend | model | models | provider — or ${p}ai help`;
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

  if (sub === 'provider') {
    return handleAiProvider(ctx);
  }

  return `Usage: ${p}ai mode | backend | model | models | provider — or ${p}ai help`;
};
