import type { TextRenderContext } from '@src/system/render-context';

import type { ProviderAddModelRepresentation } from '../representation';

export function renderProviderAddModelCli(
  representation: ProviderAddModelRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}ai provider add-model <model-id>`;
    case 'not-found':
      return `Model "${d.modelId}" not found in cached Routstr models. Try ai provider sync-models first.`;
    case 'success': {
      const action = d.isUpdate ? 'Updated' : 'Added';

      return `${action} model "${d.modelId}" in opencode.json:\n${d.entryPrettyJson}`;
    }

    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
