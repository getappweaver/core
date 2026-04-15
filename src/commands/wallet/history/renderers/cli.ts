import type { TextRenderContext } from '@src/system/render-context';

import type { WalletHistoryRepresentation } from '../representation';

export function renderWalletHistoryCli(
  representation: WalletHistoryRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'no-wallet-db':
      return 'Wallet DB not available.';
    case 'empty':
      return 'No wallet history yet.';
    case 'rows':
      return d.rows
        .map((h) => {
          let message = `${h.dateDisplay} | ${h.operation} | ${h.shortMint} | ${h.amount} sats | ${h.fee} sats fee`;

          if (d.showToken) {
            message += `\n${h.token}`;
          }

          return message;
        })
        .join('\n');
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
