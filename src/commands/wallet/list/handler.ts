import type { WalletDb } from '@src/wallet/db';
import { getCashuMints } from '@src/wallet/db';

import type { WalletListRepresentation } from './representation';

type HandleWalletListProps = {
  walletDb: WalletDb | null;
  defaultMintUrl: string | null;
};

function toRepresentation(
  data: WalletListRepresentation['data'],
): WalletListRepresentation {
  return {
    kind: 'wallet.list',
    version: 1,
    meta: { command: 'wallet', subcommand: 'list' },
    data,
  };
}

export function handleWalletList(
  props: HandleWalletListProps,
): WalletListRepresentation {
  if (!props.walletDb) {
    return toRepresentation({ view: 'no-wallet-db' });
  }

  const mints = new Map(
    getCashuMints(props.walletDb).map((result) => [
      result.mint,
      result.total_amount,
    ]),
  );

  if (props.defaultMintUrl && !mints.has(props.defaultMintUrl)) {
    mints.set(props.defaultMintUrl, 0);
  }

  const items = [...mints.entries()].map(([mintUrl, totalSats]) => ({
    mintUrl,
    totalSats,
    isDefault: props.defaultMintUrl === mintUrl,
  }));

  items.sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    return left.mintUrl.localeCompare(right.mintUrl);
  });

  return toRepresentation({
    view: 'list',
    defaultMintUrl: props.defaultMintUrl,
    totalSats: items.reduce((sum, item) => sum + item.totalSats, 0),
    items,
  });
}
