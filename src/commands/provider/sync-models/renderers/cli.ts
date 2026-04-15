import type { TextRenderContext } from '@src/system/render-context';

import type { ProviderSyncModelsRepresentation } from '../representation';

export function renderProviderSyncModelsCli(
  representation: ProviderSyncModelsRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'fetched':
      return 'Fetched new models and cached them.';
    case 'cached':
      return `Found ${d.count} cached Routstr models. Last updated: ${new Date(d.updatedAtMs).toLocaleString()}`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
