import type { TextRenderContext } from '@src/system/render-context';

import type { BotIdentityRepresentation } from '../representation';

export function renderBotIdentityCli(
  representation: BotIdentityRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}bot identity [npub] — use ${d.prefix}bot restart to request a watch restart.`;
    case 'no-pubkey':
      return 'Bot pubkey not available.';
    case 'npub':
      return d.npub;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
