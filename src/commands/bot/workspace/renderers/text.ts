import type { TextRenderContext } from '@src/system/render-context';

import type { BotWorkspaceRepresentation } from '../representation';

export function renderBotWorkspaceText(
  representation: BotWorkspaceRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'query':
      return `Workspace: ${d.target}. PWD: ${d.cwd}\nUsage: ${d.prefix}bot workspace [${d.usageOpts}]`;
    case 'invalid-usage':
      return `Usage: ${d.prefix}bot workspace [${d.usageOpts}]`;
    case 'unchanged':
      return `Workspace unchanged: ${d.target}. PWD: ${d.cwd}`;
    case 'switched':
      return `Workspace switched: ${d.previousTarget} -> ${d.nextTarget}\nNew session: ${d.newSessionId}`;
    case 'switched-session-failed':
      return `Workspace switched to ${d.nextTarget}, but failed to auto-create session: ${d.errorMessage}`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
