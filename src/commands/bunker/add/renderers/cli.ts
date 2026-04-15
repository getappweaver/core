import type { TextRenderContext } from '@src/system/render-context';

import { formatBunkerPubkey } from '../../shared/format-helpers';

import type { BunkerAddRepresentation } from '../representation';

export function renderBunkerAddCli(
  representation: BunkerAddRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'duplicate':
      return `A bunker connection named "${d.name}" already exists.`;
    case 'success':
      return `Saved bunker connection "${d.name}".
User: ${formatBunkerPubkey(d.userPubkey)}
Remote signer: ${formatBunkerPubkey(d.remoteSignerPubkey)}
Relays: ${d.relays.join(', ')}`;
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
