import type { TextRenderContext } from '@src/system/render-context';

import type { SessionNewRepresentation } from '../representation';

export function renderSessionNewText(
  representation: SessionNewRepresentation,
  _context: TextRenderContext,
): string {
  return `New session: ${representation.data.sessionId}`;
}
