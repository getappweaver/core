import type { TextRenderContext } from '@src/system/render-context';

import type { BunkerDeleteRepresentation } from '../representation';

export function renderBunkerDeleteCli(
  representation: BunkerDeleteRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'missing':
      return `No bunker connection named "${d.name}".`;
    case 'success':
      return `Deleted bunker connection "${d.name}".`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
