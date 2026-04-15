import type { TextRenderContext } from '@src/system/render-context';

import type { WalletUsageRepresentation } from '../representation';

export function renderWalletUsageCli(
  representation: WalletUsageRepresentation,
  _context: TextRenderContext,
): string {
  const p = representation.data.prefix;

  return `Usage: ${p}wallet mint [url] | balance | receive <token> | send <amount> | history [--token] — or ${p}wallet help`;
}
