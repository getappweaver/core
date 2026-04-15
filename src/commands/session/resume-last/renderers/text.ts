import type { TextRenderContext } from '@src/system/render-context';

import type { SessionResumeLastRepresentation } from '../representation';

export function renderSessionResumeLastText(
  representation: SessionResumeLastRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'empty':
      return `No sessions yet for backend '${d.backendName}'. Send a message or use session new.`;
    case 'success':
      return `Resumed session ${d.sessionId}.`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
