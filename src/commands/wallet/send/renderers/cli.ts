import type { TextRenderContext } from '@src/system/render-context';

import type { WalletSendRepresentation } from '../representation';

export function renderWalletSendCli(
  representation: WalletSendRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}wallet send <sats>`;
    case 'invalid-amount':
      return `Usage: ${d.prefix}wallet send <sats>`;
    case 'no-wallet-db':
      return 'Wallet DB not available.';
    case 'no-mnemonic':
      return 'No mnemonic configured. Set one with: bun run wallet:setup';
    case 'no-mint':
      return `No mint configured. Set one with: ${d.prefix}wallet mint <url>`;
    case 'token':
      return d.token;
    case 'failure':
      return d.message;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
