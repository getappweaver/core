import type { TextRenderContext } from '@src/system/render-context';

import type { ProviderModelsRepresentation } from '../representation';

function formatPrice(value: string | number | null): string {
  if (value == null || value === '') {
    return '?';
  }

  return String(value);
}

function formatPriceSummary(item: {
  cheapestInputPrice: number | null;
  cheapestOutputPrice: number | null;
  cheapestRequestPrice: number | null;
}): string {
  const parts = [
    item.cheapestInputPrice == null
      ? null
      : `in ${formatPrice(item.cheapestInputPrice)}`,
    item.cheapestOutputPrice == null
      ? null
      : `out ${formatPrice(item.cheapestOutputPrice)}`,
    item.cheapestRequestPrice == null
      ? null
      : `req ${formatPrice(item.cheapestRequestPrice)}`,
  ].filter((part) => part !== null);

  return parts.length > 0 ? ` | cheapest ${parts.join(', ')}` : '';
}

export function renderProviderModelsCli(
  representation: ProviderModelsRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'empty-no-cache':
      return 'No Routstr models cached. Run routstr sync-models first.';
    case 'empty-filter':
      return `No Routstr models matching "${d.filter}". Run routstr sync-models then routstr models.`;
    case 'list': {
      const needle = d.filter.trim();

      const lines = d.items.map((m) => {
        const price = formatPriceSummary(m);

        return `  ${m.id} | ${m.providerCount} provider${m.providerCount === 1 ? '' : 's'}${price}`;
      });

      return `Routstr models${needle ? ` matching "${d.filter}"` : ''} (${d.items.length}, cached ${new Date(d.newestFetchedAtMs).toLocaleString()}):\n${lines.join('\n')}`;
    }

    case 'model-providers': {
      const lines = d.providers.map((p) => {
        const ctx = p.contextLength != null ? ` | ${p.contextLength} ctx` : '';
        const name = p.modelName ? ` | ${p.modelName}` : '';

        return [
          `  ${p.endpointUrl}`,
          `provider ${p.providerD}`,
          `in ${formatPrice(p.inputPrice)}`,
          `out ${formatPrice(p.outputPrice)}`,
          `req ${formatPrice(p.requestPrice)}${ctx}${name}`,
        ].join(' | ');
      });

      return `Routstr providers for ${d.modelId} (${d.providers.length}, cached ${new Date(d.newestFetchedAtMs).toLocaleString()}):\n${lines.join('\n')}`;
    }

    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
