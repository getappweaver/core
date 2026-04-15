import type { TextRenderContext } from '@src/system/render-context';

import type { ProviderDepositRepresentation } from '../representation';

export function renderProviderDepositCli(
  representation: ProviderDepositRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}ai provider deposit <sats> [--new]`;
    case 'no-mint':
      return `No mint configured. Use ${d.prefix}wallet mint <url> first.`;
    case 'no-mnemonic':
      return 'CASHU_MNEMONIC not set.';
    case 'no-provider-db':
      return 'Provider DB not available.';
    case 'no-wallet-db':
      return 'Wallet DB not available.';
    case 'insufficient-balance':
      return `Insufficient balance: ${d.balanceSats} sats available in mint ${d.mintUrl}.\nTop up with ${d.prefix}wallet receive <token> or check ${d.prefix}wallet balance`;
    case 'no-session-key':
      return 'could not get sk-key from routstr while depositing';
    case 'success': {
      const action = d.wasNew
        ? 'Created new session'
        : 'Topped up existing session';

      return `${action} with ${d.amountSats} sats.\nSession: ${d.skPreview}\nProvider set to routstr.`;
    }

    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
