import type { TextRenderContext } from '@src/system/render-context';

import type { WalletMeltRepresentation } from '../representation';

export function renderWalletMeltCli(
  representation: WalletMeltRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
    case 'invoice-form':
      return `Usage: ${d.prefix}wallet melt <sats> <bolt11-invoice> [--mint <url>]`;
    case 'invalid-amount':
      return `Usage: ${d.prefix}wallet melt <sats> <bolt11-invoice> [--mint <url>]`;
    case 'no-wallet-db':
      return 'Wallet DB not available.';
    case 'no-mnemonic':
      return 'No mnemonic configured. Set one with: bun run wallet:setup';
    case 'no-mint':
      return `No mint configured. Set one with: ${d.prefix}wallet mint <url>`;
    case 'success':
      return `Melted ${d.paidSats} sats from ${d.mintUrl} (fee ${d.feeSats} sats)`;
    case 'failure':
      return d.message;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
