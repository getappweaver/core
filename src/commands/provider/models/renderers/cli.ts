import type { TextRenderContext } from '@src/system/render-context';

import type { ProviderModelsRepresentation } from '../representation';

export function renderProviderModelsCli(
  representation: ProviderModelsRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'empty-no-cache':
      return 'No Routstr models cached. Run ai provider sync-models first.';
    case 'empty-filter':
      return `No Routstr models matching "${d.filter}". Run ai provider sync-models then ai provider models.`;
    case 'list': {
      const needle = d.filter.trim();

      const lines = d.items.map((m) => {
        const ctx = m.contextLength != null ? ` (${m.contextLength} ctx)` : '';

        return `  routstr/${m.id}${m.name ? ` — ${m.name}` : ''}${ctx}`;
      });

      return `Routstr models${needle ? ` matching "${d.filter}"` : ''} (${d.items.length}, cached ${new Date(d.updatedAtMs).toLocaleString()}):\n${lines.join('\n')}`;
    }

    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
