import type { TextRenderContext } from '@src/system/render-context';

import type { BotPingRepresentation } from '../representation';

export function renderBotPingCli(
  _representation: BotPingRepresentation,
  _context: TextRenderContext,
): string {
  return 'pong';
}
