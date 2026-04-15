import type { TextRenderContext } from '@src/system/render-context';

import type { SessionAttachRepresentation } from '../representation';

export function renderSessionAttachText(
  representation: SessionAttachRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}session attach <opencode|cursor> <session_id>`;
    case 'backend-mismatch':
      return `Cannot attach an OpenCode session while the agent backend is ${d.activeBackend} — prompts would go to the wrong runtime. Set backend first, e.g. ${d.prefix}ai backend opencode or ${d.prefix}ai backend opencode-sdk, then run attach again.`;
    case 'not-implemented':
      return `${d.targetBackend} attach is not implemented yet.`;
    case 'success':
      return `Attached session ${d.sessionId} to ${d.attachedToBackend} and set it as current.`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
