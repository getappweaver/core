import type { RouteCommandContext } from '../../dispatch';

import { renderBotVersionText } from './renderers/text';
import { createBotVersionRepresentation } from './representation';

export function handleBotVersion(ctx: RouteCommandContext): Promise<string> {
  const rep = createBotVersionRepresentation({ version: ctx.version });

  return Promise.resolve(renderBotVersionText(rep, { prefix: ctx.prefix }));
}
