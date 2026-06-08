import type { TextRenderContext } from '@src/system/render-context';
import { formatMsats, msats } from '@src/types';

import type { ProviderUsageRepresentation } from '../representation';

function formatProviderUsageBlock(usageBase: string): string {
  return `Usage: ${usageBase} deposit <sats> [--new] | ${usageBase} refund | ${usageBase} balance | ${usageBase} budget <msats> | ${usageBase} status | ${usageBase} models [filter] | ${usageBase} sync-models | ${usageBase} add-model <id>`;
}

export function renderProviderUsageCli(
  representation: ProviderUsageRepresentation,
  context: TextRenderContext,
): string {
  const p = context.prefix;
  const usageBase = `${p}routstr`;
  const d = representation.data;

  if (d.view === 'commands-only') {
    return formatProviderUsageBlock(`${d.prefix}routstr`);
  }

  const providerLine =
    d.providerName === 'routstr'
      ? `Provider: routstr (budget: ${formatMsats(msats(d.budgetMsatsRaw ?? 0))})`
      : 'Provider: local';

  return `${providerLine}\n\n${formatProviderUsageBlock(usageBase)}`;
}
