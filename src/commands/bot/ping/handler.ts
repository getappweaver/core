import type { RouteCommandContext } from '../../dispatch';

import { renderBotPingCli } from './renderers/cli';
import { createBotPingRepresentation } from './representation';

export function handleBotPing(ctx: RouteCommandContext): Promise<string> {
  const rep = createBotPingRepresentation();

  return Promise.resolve(renderBotPingCli(rep, { prefix: ctx.prefix }));
}
