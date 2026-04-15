import type { TextRenderContext } from '@src/system/render-context';

import type { WalletDecodeRepresentation } from '../representation';

export function renderWalletDecodeCli(
  representation: WalletDecodeRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}wallet decode <cashu-token>`;
    case 'result':
      return d.text;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
