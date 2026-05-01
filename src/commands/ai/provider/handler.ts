import type { WebHandlerResult } from '@src/web/ui-schema';

import type { RouteCommandContext } from '../../dispatch';
import { runProviderCommandsFromArgs } from '../../provider/handler';

export function handleAiProvider(
  ctx: RouteCommandContext,
): Promise<WebHandlerResult> {
  return runProviderCommandsFromArgs(ctx, ctx.args.slice(1));
}
