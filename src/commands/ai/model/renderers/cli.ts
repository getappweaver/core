import type { TextRenderContext } from '@src/system/render-context';

import type { AiModelRepresentation } from '../representation';

export function renderAiModelCli(
  representation: AiModelRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'show':
      return `Backend ${d.backend} model override: ${d.override ?? '(none)'}.`;
    case 'cleared':
      return `Backend ${d.backend} model override cleared.`;
    case 'set':
      return `Backend ${d.backend} model override set to: ${d.modelId}.`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
