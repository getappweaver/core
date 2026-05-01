import { nip19 } from 'nostr-tools';

import { handleError, type RouteCommandContext } from '@src/commands/dispatch';
import type { WebHandlerResult } from '@src/web/ui-schema';

import { renderBotIdentityText } from './renderers/text';
import {
  createBotIdentityNoPubkeyRepresentation,
  createBotIdentityNpubRepresentation,
  createBotIdentityUsageRepresentation,
} from './representation';

export function handleBotIdentity(
  ctx: RouteCommandContext,
): Promise<WebHandlerResult> {
  const p = ctx.prefix;
  const action = ctx.args[1]?.toLowerCase();

  if (action != null && action !== '' && action !== 'npub') {
    const rep = createBotIdentityUsageRepresentation({ prefix: p });

    return Promise.resolve(renderBotIdentityText(rep, { prefix: p }));
  }

  if (!ctx.botPubkey) {
    const rep = createBotIdentityNoPubkeyRepresentation();

    return Promise.resolve(renderBotIdentityText(rep, { prefix: p }));
  }

  return handleError(async () => {
    const npub = nip19.npubEncode(ctx.botPubkey!);
    const rep = createBotIdentityNpubRepresentation({ npub });

    return renderBotIdentityText(rep, { prefix: p });
  }, 'Failed to encode bot pubkey');
}
