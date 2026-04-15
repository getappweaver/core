import { formatLintSummary } from '@src/lint';
import type { TextRenderContext } from '@src/system/render-context';

import type { BotLintRepresentation } from '../representation';

export function renderBotLintCli(
  representation: BotLintRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'run': {
      const r = d.result;

      if (!r.available) {
        return `Lint not available in this runtime for ${r.label} (bun run lint missing).`;
      }

      return formatLintSummary({
        label: r.label,
        available: r.available,
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
      });
    }

    case 'auto-query':
      return `Auto lint: ${d.value}.`;
    case 'auto-set':
      return `Auto lint set to: ${d.value}.`;
    case 'usage':
      return `Usage: ${d.prefix}bot lint — run lint now; ${d.prefix}bot lint auto — status; ${d.prefix}bot lint auto [${d.lintOpts}] — set auto lint after agent.`;
    case 'auto-invalid':
      return `Usage: ${d.prefix}bot lint auto [${d.lintOpts}]`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
