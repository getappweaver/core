import type { TextRenderContext } from '@src/system/render-context';

import type { WalletPayRepresentation } from '../representation';

export function renderWalletPayCli(
  representation: WalletPayRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}wallet pay <sats> [--mint <url>]`;
    case 'invalid-amount':
      return `Usage: ${d.prefix}wallet pay <sats> [--mint <url>]`;
    case 'no-wallet-db':
      return 'Wallet DB not available.';
    case 'no-mnemonic':
      return 'No mnemonic configured. Set one with: bun run wallet:setup';
    case 'no-mint':
      return `No mint configured. Set one with: ${d.prefix}wallet mint <url>`;
    case 'quote':
      return d.invoice;
    case 'success':
      return `Minted ${d.receivedSats} sats from ${d.mintUrl}`;
    case 'failure':
      return d.message;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
