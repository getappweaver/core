import type { TextRenderContext } from '@src/system/render-context';

import type { ProviderRefundRepresentation } from '../representation';

export function renderProviderRefundCli(
  representation: ProviderRefundRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'no-mint':
      return 'No mint configured.';
    case 'no-mnemonic':
      return 'No mnemonic configured. Set one with: bun run wallet:setup';
    case 'no-provider-db':
      return 'Provider DB not available.';
    case 'no-sk-key':
      return 'sk-key is not set';
    case 'success':
      return d.sats === 0
        ? 'Nothing to refund (session balance was 0).'
        : `Refunded ${d.sats} sats to local wallet. Session key kept for future use.`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
