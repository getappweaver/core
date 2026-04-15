import type { RouteCommandContext } from '../../dispatch';

import { renderBotLintCli } from './renderers/cli';
import { buildBotLintRepresentationFromArgs } from './representation';

export function handleBotLint(ctx: RouteCommandContext): Promise<string> {
  const rep = buildBotLintRepresentationFromArgs({
    db: ctx.seenDb,
    args: ctx.args.slice(1),
    cwd: ctx.cwd,
    prefix: ctx.prefix,
  });

  return Promise.resolve(renderBotLintCli(rep, { prefix: ctx.prefix }));
}
