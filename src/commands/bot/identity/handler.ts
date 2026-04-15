import { nip19 } from 'nostr-tools';

import { handleError, type RouteCommandContext } from '@src/commands/dispatch';
import type { WebNodeRoot } from '@src/web/ui-schema';

import { renderBotIdentityCli } from './renderers/cli';
import {
  createBotIdentityNoPubkeyRepresentation,
  createBotIdentityNpubRepresentation,
  createBotIdentityUsageRepresentation,
} from './representation';

export function handleBotIdentity(
  ctx: RouteCommandContext,
): Promise<string | WebNodeRoot> {
  const p = ctx.prefix;
  const action = ctx.args[1]?.toLowerCase();

  if (action != null && action !== '' && action !== 'npub') {
    const rep = createBotIdentityUsageRepresentation({ prefix: p });

    return Promise.resolve(renderBotIdentityCli(rep, { prefix: p }));
  }

  if (!ctx.botPubkey) {
    const rep = createBotIdentityNoPubkeyRepresentation();

    return Promise.resolve(renderBotIdentityCli(rep, { prefix: p }));
  }

  return handleError(async () => {
    const npub = nip19.npubEncode(ctx.botPubkey!);
    const rep = createBotIdentityNpubRepresentation({ npub });

    return renderBotIdentityCli(rep, { prefix: p });
  }, 'Failed to encode bot pubkey');
}
