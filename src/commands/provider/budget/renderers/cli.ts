import type { TextRenderContext } from '@src/system/render-context';
import { formatMsats, msats } from '@src/types';

import type { ProviderBudgetRepresentation } from '../representation';

export function renderProviderBudgetCli(
  representation: ProviderBudgetRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Current budget: ${formatMsats(msats(d.currentBudgetMsatsRaw))}.\nUsage: ${d.prefix}ai provider budget <msats>`;
    case 'set':
      return `Budget set to: ${formatMsats(msats(d.budgetMsatsRaw))}`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
