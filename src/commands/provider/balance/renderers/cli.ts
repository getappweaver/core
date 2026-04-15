import type { TextRenderContext } from '@src/system/render-context';
import { formatMsats, msats } from '@src/types';

import type { ProviderBalanceRepresentation } from '../representation';

export function renderProviderBalanceCli(
  representation: ProviderBalanceRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;
  const suffix = d.budgetWasUpdated ? ' (budget updated)' : '';

  return `Routstr session balance: ${formatMsats(msats(d.balanceMsatsRaw))}${suffix}`;
}
