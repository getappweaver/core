import type { WalletDb } from '@src/wallet/db';
import { getBalanceByMint } from '@src/wallet/db';

import type { WalletBalanceRepresentation } from './representation';

type HandleWalletBalanceProps = {
  walletDb: WalletDb | null;
  mintUrl: string | null;
  prefix: string;
};

function toRepresentation(
  data: WalletBalanceRepresentation['data'],
): WalletBalanceRepresentation {
  return {
    kind: 'wallet.balance',
    version: 1,
    meta: { command: 'wallet', subcommand: 'balance' },
    data,
  };
}

export async function handleWalletBalance(
  props: HandleWalletBalanceProps,
): Promise<WalletBalanceRepresentation> {
  const { walletDb, mintUrl, prefix } = props;

  if (!mintUrl) {
    return toRepresentation({ view: 'no-mint', prefix });
  }

  if (!walletDb) {
    return toRepresentation({ view: 'no-wallet-db' });
  }

  const { balanceSats } = await getBalanceByMint(walletDb, mintUrl);

  return toRepresentation({
    view: 'ok',
    mintUrl,
    balanceSats,
  });
}
