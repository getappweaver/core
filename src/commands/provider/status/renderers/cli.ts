import type { TextRenderContext } from '@src/system/render-context';
import { formatMsats, msats } from '@src/types';

import type { ProviderStatusRepresentation } from '../representation';

export function renderProviderStatusCli(
  representation: ProviderStatusRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'no-mint':
      return `No mint configured. Use ${d.prefix}wallet mint <url> first.`;
    case 'local':
      return 'Provider: local | no payment';
    case 'routstr':
      return [
        `Provider:       routstr`,
        `Session key:    ${d.sessionKeyShort ? `${d.sessionKeyShort}...` : 'none'}`,
        `Mint:           ${d.mintUrl}`,
        `Default budget: ${formatMsats(msats(d.budgetMsatsRaw))}`,
        `Model:          ${d.modelId ? `routstr/${d.modelId}` : '(not set)'}`,
      ].join('\n');
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
