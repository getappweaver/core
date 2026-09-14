import type { TextRenderContext } from '@src/system/render-context';

import type { WalletMintsRepresentation } from '../representation';

export function renderWalletMintsCli(
  representation: WalletMintsRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'no-wallet-db':
      return 'Wallet DB not available.';
    case 'list': {
      const lines = d.items.map((r) => `${r.mintUrl}: ${r.totalSats} sats`);

      return `Available mints:\n${lines.join('\n')}`;
    }

    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
