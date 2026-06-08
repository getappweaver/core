import type { TextRenderContext } from '@src/system/render-context';

import type { WalletHistoryRepresentation } from '../representation';

export function renderWalletHistoryCli(
  representation: WalletHistoryRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  function historyKindLabel(kind: string | null): string | null {
    switch (kind) {
      case 'send':
        return 'send token';
      case 'melt':
        return 'melt invoice';
      case 'receive':
        return 'receive token';
      case 'mint':
        return 'mint token';
      default:
        return kind;
    }
  }

  function historyLabel(operation: string, kind: string | null): string {
    const kindLabel = historyKindLabel(kind);

    if (!kindLabel) {
      return operation;
    }

    return `${operation} · ${kindLabel}`;
  }

  switch (d.view) {
    case 'no-wallet-db':
      return 'Wallet DB not available.';
    case 'empty':
      return 'No wallet history yet.';
    case 'rows':
      return d.rows
        .map((h) => {
          let message = `${h.dateDisplay} | ${historyLabel(h.operation, h.kind)} | ${h.shortMint} | ${h.amount} sats | ${h.fee} sats fee`;

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
