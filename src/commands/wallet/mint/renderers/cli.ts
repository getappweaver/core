import type { TextRenderContext } from '@src/system/render-context';

import type { WalletMintRepresentation } from '../representation';

export function renderWalletMintCli(
  representation: WalletMintRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'current':
      return `Current mint: ${d.mintUrl}`;
    case 'hint-no-mint':
      return `No mint configured. Set one with: ${d.prefix}wallet mint <url>`;
    case 'set':
      return `Mint set to: ${d.mintUrl}`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
