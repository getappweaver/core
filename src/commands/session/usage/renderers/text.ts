import type { TextRenderContext } from '@src/system/render-context';

import type { SessionUsageRepresentation } from '../representation';

export function renderSessionUsageText(
  representation: SessionUsageRepresentation,
  _context: TextRenderContext,
): string {
  const p = representation.data.prefix;

  return `Usage: ${p}session new | attach opencode <id> | adopt <id> | resume-last | resume <id> | list [--limit N] | list-native --opencode | messages <id> [N] — or ${p}session help`;
}
