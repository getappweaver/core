import type { WalletDb } from '@src/wallet/db';
import { getCashuMints } from '@src/wallet/db';

import type { WalletMintsRepresentation } from './representation';

type HandleWalletMintsProps = {
  walletDb: WalletDb | null;
};

function toRepresentation(
  data: WalletMintsRepresentation['data'],
): WalletMintsRepresentation {
  return {
    kind: 'wallet.mints',
    version: 1,
    meta: { command: 'wallet', subcommand: 'mints' },
    data,
  };
}

export function handleWalletMints(
  props: HandleWalletMintsProps,
): WalletMintsRepresentation {
  if (!props.walletDb) {
    return toRepresentation({ view: 'no-wallet-db' });
  }

  const result = getCashuMints(props.walletDb);

  return toRepresentation({
    view: 'list',
    items: result.map((r) => ({
      mintUrl: r.mint,
      totalSats: r.total_amount,
    })),
  });
}
