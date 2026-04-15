// ---------------------------------------------------------------------------
// src/commands/shared/with-status.ts — append status block after command output
// ---------------------------------------------------------------------------

import { renderBotStatusText } from '../bot/status/renderers/text';
import { createBotStatusRepresentation } from '../bot/status/representation';
import type { RouteCommandContext } from '../dispatch';

export function statusPropsFromContext(ctx: RouteCommandContext) {
  return {
    botRelayUrls: ctx.botRelayUrls,
    seenDb: ctx.seenDb,
    version: ctx.version,
    dmBotRoot: ctx.dmBotRoot,
    attachUrl: ctx.attachUrl,
  };
}

export async function appendStatusBlock(
  ctx: RouteCommandContext,
  body: string,
): Promise<string> {
  const rep = createBotStatusRepresentation(statusPropsFromContext(ctx));
  const status = renderBotStatusText(rep, { prefix: ctx.prefix });

  return `${body}\n\n${status}`;
}
