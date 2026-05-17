import type { TextRenderContext } from '@src/system/render-context';

import type { BunkerUsageRepresentation } from '../representation';

export function renderBunkerUsageCli(
  _representation: BunkerUsageRepresentation,
  context: TextRenderContext,
): string {
  const p = context.prefix;

  return `Usage: ${p}bunker list | ${p}bunker add <name> <bunker://...> | ${p}bunker delete <name>`;
}
