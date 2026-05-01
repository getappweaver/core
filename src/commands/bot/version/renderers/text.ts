import type { TextRenderContext } from '@src/system/render-context';

import type { BotVersionRepresentation } from '../representation';

export function renderBotVersionText(
  representation: BotVersionRepresentation,
  _context: TextRenderContext,
): string {
  return `Version: ${representation.data.version}`;
}
