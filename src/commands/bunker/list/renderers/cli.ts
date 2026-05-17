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
          const remoteSignerLine =
            item.remoteSignerPubkey === item.userPubkey
              ? ''
              : `\nRemote signer: ${formatBunkerPubkey(item.remoteSignerPubkey)}`;

          const relays =
            item.relays.length > 0 ? item.relays.join(', ') : '(none)';

          return `${index + 1}. ${item.name}
User: ${formatBunkerPubkey(item.userPubkey)}${remoteSignerLine}
Relays: ${item.relays.length} (${relays})
Created: ${formatBunkerCreatedAt(item.createdAtMs)}`;
        })
        .join('\n\n');
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
