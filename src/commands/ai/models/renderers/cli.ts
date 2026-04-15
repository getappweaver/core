import { C } from '@src/logger';
import type { TextRenderContext } from '@src/system/render-context';

import type { AiModelsRepresentation } from '../representation';

export function renderAiModelsCli(
  representation: AiModelsRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'empty':
      return `No models found for backend '${d.backend}'.`;
    case 'list': {
      const lines = d.items.map((item) => {
        const marker = item.isCurrent
          ? ` ${C.green}*[current (override)]${C.reset}`
          : '';

        return `  ${item.modelId}${marker}`;
      });

      return `Available models for ${d.backend}:\n${lines.join('\n')}`;
    }

    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
