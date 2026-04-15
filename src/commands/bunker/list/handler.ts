import type { CoreDb } from '@src/db';
import { listConnections } from '@src/nostr/connections';

import type { BunkerListRepresentation } from './representation';

type HandleBunkerListProps = {
  db: CoreDb;
};

export function handleBunkerList({
  db,
}: HandleBunkerListProps): BunkerListRepresentation {
  const connections = listConnections(db);

  if (connections.length === 0) {
    return {
      kind: 'bunker.list',
      version: 1,
      meta: { command: 'bunker', subcommand: 'list' },
      data: { view: 'empty' },
    };
  }

  return {
    kind: 'bunker.list',
    version: 1,
    meta: { command: 'bunker', subcommand: 'list' },
    data: {
      view: 'list',
      items: connections.map((c) => ({
        name: c.name,
        userPubkey: c.data.userPubkey,
        remoteSignerPubkey: c.data.remoteSignerPubkey,
        relays: c.data.relays,
        createdAtMs: c.created_at,
      })),
    },
  };
}
