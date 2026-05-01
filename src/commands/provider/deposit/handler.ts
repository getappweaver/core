import { getWalletDefaultMintUrl, setProviderName } from '@src/db';
import { depositOrTopup } from '@src/providers/routstr';
import { getBalanceByMint } from '@src/wallet/db';

import type { RouteCommandContext } from '../../dispatch';

import type { ProviderDepositRepresentation } from './representation';

function toRepresentation(
  data: ProviderDepositRepresentation['data'],
): ProviderDepositRepresentation {
  return {
    kind: 'provider.deposit',
    version: 1,
    meta: { command: 'provider', subcommand: 'deposit' },
    data,
  };
}

type RunProviderDepositProps = {
  ctx: RouteCommandContext;
  args: string[];
};

export async function runProviderDeposit(
  props: RunProviderDepositProps,
): Promise<ProviderDepositRepresentation> {
  const { ctx, args } = props;
  const p = ctx.prefix;
  const depositArgs = args.slice(1);
  const forceNew = depositArgs.includes('--new');
  const satsArg = depositArgs.find((a) => a !== '--new');
  const sats = parseInt(satsArg ?? '', 10);

  if (isNaN(sats) || sats <= 0) {
    return toRepresentation({ view: 'usage', prefix: p });
  }

  const mintUrl = getWalletDefaultMintUrl(
    ctx.seenDb,
    ctx.config.cashuDefaultMintUrl,
  );

  if (!mintUrl) {
    return toRepresentation({ view: 'no-mint', prefix: p });
  }

  const mnemonic = ctx.config.cashuMnemonic;

  if (!mnemonic) {
    return toRepresentation({ view: 'no-mnemonic' });
  }

  if (!ctx.providerDb) {
    return toRepresentation({ view: 'no-provider-db' });
  }

  if (!ctx.walletDb) {
    return toRepresentation({ view: 'no-wallet-db' });
  }

  const { balanceSats } = await getBalanceByMint(ctx.walletDb, mintUrl);

  if (balanceSats < sats) {
    return toRepresentation({
      view: 'insufficient-balance',
      balanceSats,
      mintUrl,
      prefix: p,
    });
  }

  const { skKey, wasNew } = await depositOrTopup({
    seenDb: ctx.seenDb,
    walletDb: ctx.walletDb,
    mnemonic,
    providerDb: ctx.providerDb,
    mintUrl,
    amountSats: sats,
    forceNew,
  });

  if (!skKey) {
    return toRepresentation({ view: 'no-session-key' });
  }

  setProviderName(ctx.seenDb, 'routstr');

  return toRepresentation({
    view: 'success',
    wasNew,
    amountSats: sats,
    skPreview: `${skKey.slice(0, 8)}...`,
  });
}
