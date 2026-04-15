import type { TextRenderContext } from '@src/system/render-context';

import type { SessionMessagesRepresentation } from '../representation';

export function renderSessionMessagesText(
  representation: SessionMessagesRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}session messages <session_id> [N]`;
    case 'empty':
      return 'No messages for that session.';
    case 'transcript':
      return d.lines
        .map((line) => `${line.role}: ${line.contentPreview}`)
        .join('\n\n');
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
