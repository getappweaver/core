import {
  getProviderName,
  getRoutstrBudget,
  getRoutstrModel,
  getRoutstrSkKey,
  getWalletDefaultMintUrl,
} from '@src/db';
import { getRoutstrBalance } from '@src/providers/routstr';
import { msatsRaw } from '@src/types';
import { getCashuMints } from '@src/wallet/db';

import type { RouteCommandContext } from '../../dispatch';

import type { ProviderStatusRepresentation } from './representation';

type RunProviderStatusProps = {
  ctx: RouteCommandContext;
};

function toRepresentation(
  data: ProviderStatusRepresentation['data'],
): ProviderStatusRepresentation {
  return {
    kind: 'provider.status',
    version: 1,
    meta: { command: 'provider', subcommand: 'status' },
    data,
  };
}

export async function runProviderStatus(
  props: RunProviderStatusProps,
): Promise<ProviderStatusRepresentation> {
  const { ctx } = props;
  const providerName = getProviderName(ctx.seenDb);
  const skKey = getRoutstrSkKey(ctx.seenDb);
  const model = getRoutstrModel(ctx.seenDb);
  const budgetMsats = getRoutstrBudget(ctx.seenDb);

  const defaultMintUrl = getWalletDefaultMintUrl(
    ctx.seenDb,
    ctx.config.cashuDefaultMintUrl,
  );

  const walletMints = ctx.walletDb
    ? getCashuMints(ctx.walletDb).map((mint) => ({
        mintUrl: mint.mint,
        totalSats: mint.total_amount,
        isDefault: defaultMintUrl === mint.mint,
      }))
    : [];

  if (
    defaultMintUrl &&
    !walletMints.some((item) => item.mintUrl === defaultMintUrl)
  ) {
    walletMints.unshift({
      mintUrl: defaultMintUrl,
      totalSats: 0,
      isDefault: true,
    });
  }

  walletMints.sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    return left.mintUrl.localeCompare(right.mintUrl);
  });

  let routstrBalanceMsatsRaw: number | null = null;
  let routstrBalanceError: string | null = null;

  if (skKey) {
    try {
      routstrBalanceMsatsRaw = msatsRaw(await getRoutstrBalance(ctx.seenDb));
    } catch (err) {
      routstrBalanceError = err instanceof Error ? err.message : String(err);
    }
  }

  return toRepresentation({
    view: 'status',
    providerName,
    sessionKeyShort: skKey ? skKey.slice(0, 6) : null,
    hasSessionKey: Boolean(skKey),
    budgetMsatsRaw: msatsRaw(budgetMsats),
    routstrBalanceMsatsRaw,
    routstrBalanceError,
    modelId: model,
    hasMnemonic: Boolean(ctx.config.cashuMnemonic),
    hasWalletDb: Boolean(ctx.walletDb),
    defaultMintUrl,
    walletTotalSats: walletMints.reduce((sum, item) => sum + item.totalSats, 0),
    walletMints,
  });
}
