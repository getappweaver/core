import type { WalletDb } from '@src/wallets/db';
import { getWalletHistory } from '@src/wallets/db';

import type { WalletHistoryRepresentation } from './representation';

type HandleWalletHistoryProps = {
  walletDb: WalletDb | null;
  showToken: boolean;
};

function toRepresentation(
  data: WalletHistoryRepresentation['data'],
): WalletHistoryRepresentation {
  return {
    kind: 'wallet.history',
    version: 1,
    meta: { command: 'wallet', subcommand: 'history' },
    data,
  };
}

export function handleWalletHistory(
  props: HandleWalletHistoryProps,
): WalletHistoryRepresentation {
  if (!props.walletDb) {
    return toRepresentation({ view: 'no-wallet-db' });
  }

  const history = getWalletHistory(props.walletDb, 10);

  if (history.length === 0) {
    return toRepresentation({ view: 'empty' });
  }

  return toRepresentation({
    view: 'rows',
    showToken: props.showToken,
    rows: history.map((h) => {
      const dateDisplay = new Date(h.ts)
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ');

      const shortMint = h.mint_url
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');

      return {
        dateDisplay,
        operation: h.operation,
        shortMint,
        amount: h.amount,
        fee: h.fee,
        token: h.token,
      };
    }),
  });
}
