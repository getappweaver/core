import type { RouteCommandContext } from '../../dispatch';

import { renderBotVersionCli } from './renderers/cli';
import { createBotVersionRepresentation } from './representation';

export function handleBotVersion(ctx: RouteCommandContext): Promise<string> {
  const rep = createBotVersionRepresentation({ version: ctx.version });

  return Promise.resolve(renderBotVersionCli(rep, { prefix: ctx.prefix }));
}
