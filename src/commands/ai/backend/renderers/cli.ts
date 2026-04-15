import type { TextRenderContext } from '@src/system/render-context';

import type { AiBackendRepresentation } from '../representation';

export function renderAiBackendCli(
  representation: AiBackendRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'query':
      return `Backend: ${d.backend}.`;
    case 'invalid-usage':
      return `Usage: ${d.prefix}ai backend [${d.backendOpts}]`;
    case 'unchanged':
      return `Backend unchanged: ${d.backend}.`;
    case 'switched':
      return `Backend switched: ${d.previousBackend} -> ${d.nextBackend}\nNew session: ${d.newSessionId}`;
    case 'switched-session-failed':
      return `Backend switched to ${d.nextBackend}, but failed to auto-create session: ${d.errorMessage}`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
