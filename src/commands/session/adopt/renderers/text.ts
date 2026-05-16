import type { TextRenderContext } from '@src/system/render-context';

import type { SessionAdoptRepresentation } from '../representation';

export function renderSessionAdoptText(
  representation: SessionAdoptRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}session adopt <session_id>`;
    case 'backend-mismatch':
      return `Cannot adopt an OpenCode session while the agent backend is ${d.activeBackend} — prompts would go to the wrong runtime. Set backend first, e.g. ${d.prefix}ai backend opencode, then run adopt again.`;
    case 'not-found':
      return `Native OpenCode session not found: ${d.sessionId}`;
    case 'success':
      return `Adopted OpenCode session ${d.sessionId} (${d.title}) and set it as current. Previous native transcript was not imported into AppWeaver history.`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
