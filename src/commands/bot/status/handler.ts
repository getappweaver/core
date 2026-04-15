import type { WebNodeRoot } from '@src/web/ui-schema';

import { handleError, type RouteCommandContext } from '../../dispatch';
import { statusPropsFromContext } from '../../shared/with-status';

import { renderBotStatusText } from './renderers/text';
import { renderBotStatusWeb } from './renderers/web';
import { createBotStatusRepresentation } from './representation';

export async function handleBotStatus(
  ctx: RouteCommandContext,
): Promise<string | WebNodeRoot> {
  return handleError(async () => {
    const rep = createBotStatusRepresentation(statusPropsFromContext(ctx));

    if (ctx.source === 'web') {
      return renderBotStatusWeb(rep, { prefix: ctx.prefix });
    }

    return renderBotStatusText(rep, { prefix: ctx.prefix });
  }, 'Failed to get status');
}
