import type { TextRenderContext } from '@src/system/render-context';

import type { SessionRenameRepresentation } from '../representation';

export function renderSessionRenameText(
  representation: SessionRenameRepresentation,
  _context: TextRenderContext,
): string {
  const data = representation.data;

  return data.view === 'usage'
    ? `Usage: ${data.prefix}session rename <session_id> <title>`
    : `Renamed session ${data.sessionId} to "${data.title}".`;
}
