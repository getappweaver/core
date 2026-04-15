import type { TextRenderContext } from '@src/system/render-context';

import type { AiModeRepresentation } from '../representation';

export function renderAiModeCli(
  representation: AiModeRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}ai mode <${d.allowedModes}>`;
    case 'unknown':
      return `Unknown mode: ${d.modeArg}. Possible values: ${d.allowedModes}`;
    case 'set':
      return `Mode set to: ${d.mode}`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
