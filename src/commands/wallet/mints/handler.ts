import type { WalletDb } from '@src/wallet/db';
import { getCashuMints } from '@src/wallet/db';

import type { WalletMintsRepresentation } from './representation';

type HandleWalletMintsProps = {
  walletDb: WalletDb | null;
  defaultMintUrl: string | null;
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
  const mints = new Map(result.map((r) => [r.mint, r.total_amount]));

  if (props.defaultMintUrl && !mints.has(props.defaultMintUrl)) {
    mints.set(props.defaultMintUrl, 0);
  }

  return toRepresentation({
    view: 'list',
    items: [...mints.entries()].map(([mintUrl, totalSats]) => ({
      mintUrl,
      totalSats,
    })),
  });
}
