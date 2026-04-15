import type { TextRenderContext } from '@src/system/render-context';

import type { SessionResumeRepresentation } from '../representation';

export function renderSessionResumeText(
  representation: SessionResumeRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}session resume <session_id>`;
    case 'not-found':
      return 'Session not found.';
    case 'success':
      return `Resumed session ${d.sessionId}.`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
