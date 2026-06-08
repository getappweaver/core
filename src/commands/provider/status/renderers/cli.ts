import type { TextRenderContext } from '@src/system/render-context';
import { formatMsats, msats } from '@src/types';

import type { ProviderStatusRepresentation } from '../representation';

export function renderProviderStatusCli(
  representation: ProviderStatusRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  return [
    `Provider:       ${d.providerName}`,
    `Session key:    ${d.sessionKeyShort ? `${d.sessionKeyShort}...` : 'none'}`,
    `Routstr balance:${d.routstrBalanceMsatsRaw == null ? ' unknown' : ` ${formatMsats(msats(d.routstrBalanceMsatsRaw))}`}`,
    `Default budget: ${formatMsats(msats(d.budgetMsatsRaw))}`,
    `Model:          ${d.modelId ? `routstr/${d.modelId}` : '(not set)'}`,
    `Wallet:         ${d.hasWalletDb ? `${d.walletTotalSats} sats across ${d.walletMints.length} mint${d.walletMints.length === 1 ? '' : 's'}` : 'not available'}`,
    `Default mint:   ${d.defaultMintUrl ?? '(not set)'}`,
  ].join('\n');
}
