import { getRoutstrSkKey, getWalletDefaultMintUrl } from '@src/db';
import { refundRoutstr } from '@src/providers/routstr';

import type { RouteCommandContext } from '../../dispatch';

import type { ProviderRefundRepresentation } from './representation';

function toRepresentation(
  data: ProviderRefundRepresentation['data'],
): ProviderRefundRepresentation {
  return {
    kind: 'provider.refund',
    version: 1,
    meta: { command: 'provider', subcommand: 'refund' },
    data,
  };
}

export async function runProviderRefund(
  ctx: RouteCommandContext,
): Promise<ProviderRefundRepresentation> {
  const mintUrl = getWalletDefaultMintUrl(
    ctx.seenDb,
    ctx.config.cashuDefaultMintUrl,
  );

  if (!mintUrl) {
    return toRepresentation({ view: 'no-mint' });
  }

  const mnemonic = ctx.config.cashuMnemonic;

  if (!mnemonic) {
    return toRepresentation({ view: 'no-mnemonic' });
  }

  if (!ctx.providerDb) {
    return toRepresentation({ view: 'no-provider-db' });
  }

  const skKey = getRoutstrSkKey(ctx.seenDb);

  if (!skKey) {
    return toRepresentation({ view: 'no-sk-key' });
  }

  const sats = await refundRoutstr({
    mnemonic,
    providerDb: ctx.providerDb,
    seenDb: ctx.seenDb,
    mintUrl,
    skKey,
  });

  return toRepresentation({ view: 'success', sats });
}
