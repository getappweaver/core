import { ProviderNameSchema } from '@src/db';
import type { TextRenderContext } from '@src/system/render-context';
import { formatMsats, msats } from '@src/types';

import type { ProviderUsageRepresentation } from '../representation';

function formatProviderUsageBlock(usageBase: string): string {
  return `Usage: ${usageBase} set [${ProviderNameSchema.options.join('|')}] | ${usageBase} deposit <sats> [--new] | ${usageBase} refund | ${usageBase} balance | ${usageBase} budget <sats> | ${usageBase} status | ${usageBase} models [filter] | ${usageBase} sync-models | ${usageBase} add-model <id>`;
}

export function renderProviderUsageCli(
  representation: ProviderUsageRepresentation,
  context: TextRenderContext,
): string {
  const p = context.prefix;
  const usageBase = `${p}ai provider`;
  const d = representation.data;

  if (d.view === 'commands-only') {
    return formatProviderUsageBlock(`${d.prefix}ai provider`);
  }

  const providerLine =
    d.providerName === 'routstr'
      ? `Provider: routstr (budget: ${formatMsats(msats(d.budgetMsatsRaw ?? 0))})`
      : 'Provider: local';

  return `${providerLine}\n\n${formatProviderUsageBlock(usageBase)}`;
}
