// ---------------------------------------------------------------------------
// src/commands/bot/handler.ts — bot <subcommand> DM builtin root
// ---------------------------------------------------------------------------

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import { handleBotIdentity } from './identity/handler';
import { handleBotInferenceKey } from './inference-key/handler';
import { handleBotLint } from './lint/handler';
import { handleBotLog } from './log/handler';
import { handleBotPing } from './ping/handler';
import { handleBotPush } from './push/handler';
import { handleBotReady } from './ready/handler';
import { handleBotRestart } from './restart/handler';
import { handleBotStatus } from './status/handler';
import { handleBotUpdate } from './update/handler';
import { handleBotUpdateCheck } from './update-check/handler';
import { handleBotVersion } from './version/handler';
import { handleBotWorkspaceCommand } from './workspace/handler';

export const handleBotRoot: BuiltinHandler = (ctx) => {
  const p = ctx.prefix;
  const args = ctx.args;
  const sub = args[0]?.toLowerCase();

  if (sub === 'help') {
    const topic = args[1]?.toLowerCase() ?? null;

    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: p,
        root: 'bot',
        topic,
      }),
    );
  }

  if (!sub) {
    return Promise.resolve(
      `Usage: ${p}bot status | update-check | update | version | ping | identity | inference-key | workspace | lint | log | ready | push | restart — or ${p}bot help`,
    );
  }

  if (sub === 'status') {
    return handleBotStatus(ctx);
  }

  if (sub === 'update-check' || sub === 'updates') {
    return handleBotUpdateCheck(ctx);
  }

  if (sub === 'update') {
    return handleBotUpdate(ctx);
  }

  if (sub === 'version') {
    return handleBotVersion(ctx);
  }

  if (sub === 'ping') {
    return handleBotPing(ctx);
  }

  if (sub === 'identity') {
    return handleBotIdentity(ctx);
  }

  if (sub === 'inference-key') {
    return handleBotInferenceKey(ctx);
  }

  if (sub === 'workspace') {
    return handleBotWorkspaceCommand(ctx);
  }

  if (sub === 'lint') {
    return handleError(async () => handleBotLint(ctx), 'Lint command failed');
  }

  if (sub === 'log') {
    return handleBotLog(ctx);
  }

  if (sub === 'ready') {
    return handleBotReady(ctx);
  }

  if (sub === 'push') {
    return handleBotPush(ctx);
  }

  if (sub === 'restart') {
    return handleBotRestart();
  }

  return Promise.resolve(
    `Unknown ${p}bot subcommand: ${sub}. Use ${p}bot help.`,
  );
};
