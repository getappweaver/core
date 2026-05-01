import type { RouteCommandContext } from '../../dispatch';

import { renderBotPingText } from './renderers/text';
import { createBotPingRepresentation } from './representation';

export function handleBotPing(ctx: RouteCommandContext): Promise<string> {
  const rep = createBotPingRepresentation();

  return Promise.resolve(renderBotPingText(rep, { prefix: ctx.prefix }));
}
