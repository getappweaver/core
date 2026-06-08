import type { WebHandlerResult } from '@src/web/ui-schema';

import type { RouteCommandContext } from '../../dispatch';
import { renderProviderCli } from '../../provider/cli-representation';
import { handleProviderSet } from '../../provider/set/handler';
import { appendStatusBlock } from '../../shared/with-status';

export function handleAiProvider(
  ctx: RouteCommandContext,
): Promise<WebHandlerResult> {
  const providerName = ctx.args[1]?.toLowerCase();

  const rep = handleProviderSet({
    seenDb: ctx.seenDb,
    name: providerName,
    prefix: ctx.prefix,
  });

  const rendered = renderProviderCli(rep, { prefix: ctx.prefix });

  return appendStatusBlock(ctx, rendered);
}
