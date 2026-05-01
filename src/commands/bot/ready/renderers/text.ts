import type { TextRenderContext } from '@src/system/render-context';

import type { BotReadyRepresentation } from '../representation';

export function renderBotReadyText(
  representation: BotReadyRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Ready DM on startup: ${d.current}. Usage: ${d.prefix}bot ready [on|off]`;
    case 'toggled':
      return `Ready DM on startup: ${d.value}. Written to .env. Takes effect on next restart.`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
