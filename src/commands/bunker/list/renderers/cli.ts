import type { TextRenderContext } from '@src/system/render-context';

import {
  formatBunkerCreatedAt,
  formatBunkerPubkey,
} from '../../shared/format-helpers';

import type { BunkerListRepresentation } from '../representation';

export function renderBunkerListCli(
  representation: BunkerListRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'empty':
      return 'No bunker connections found. Add one with bunker add <name> <address> (after your DM command prefix).';
    case 'list':
      return d.items
        .map((item, index) => {
          const firstRelay = item.relays[0] ?? '(none)';

          return `${index + 1}. ${item.name}
User: ${formatBunkerPubkey(item.userPubkey)}
Remote signer: ${formatBunkerPubkey(item.remoteSignerPubkey)}
Relays: ${item.relays.length} (${firstRelay})
Created: ${formatBunkerCreatedAt(item.createdAtMs)}`;
        })
        .join('\n\n');
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
