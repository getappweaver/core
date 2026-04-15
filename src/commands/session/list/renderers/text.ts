import type { TextRenderContext } from '@src/system/render-context';

import type { SessionListRepresentation } from '../representation';

export function renderSessionListText(
  representation: SessionListRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'empty':
      return 'No sessions yet.';
    case 'rows':
      return d.rows
        .map(
          (r) =>
            `[${r.backend}] ${r.id} ${r.createdAtIso}${r.isCurrent ? ' (current)' : ''}`,
        )
        .join('\n');
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
