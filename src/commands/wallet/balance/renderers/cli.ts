import type { TextRenderContext } from '@src/system/render-context';

import type { WalletBalanceRepresentation } from '../representation';

export function renderWalletBalanceCli(
  representation: WalletBalanceRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'no-wallet-db':
      return 'Wallet DB not available.';
    case 'no-mint':
      return `No mint configured. Set one with: ${d.prefix}wallet mint <url>`;
    case 'ok':
      return `Wallet balance on mint ${d.mintUrl}: ${d.balanceSats} sats`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
