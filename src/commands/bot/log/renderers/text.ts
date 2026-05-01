import type { TextRenderContext } from '@src/system/render-context';

import type { BotLogRepresentation } from '../representation';

export function renderBotLogText(
  representation: BotLogRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage': {
      const current = d.currentOn ? 'on' : 'off';

      if (d.variant === 'wrong-subcommand') {
        return `Usage: ${d.prefix}bot log info [on|off]. Info logs: ${current}.`;
      }

      return `Info logs: ${current}. Usage: ${d.prefix}bot log info [on|off]`;
    }

    case 'toggled': {
      const logArg = d.enabled ? 'on' : 'off';

      return `Info logs: ${logArg}. Written to .env.`;
    }

    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
