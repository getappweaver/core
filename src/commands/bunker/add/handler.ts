import type { SimplePool } from 'nostr-tools/pool';

import type { CoreDb } from '@src/db';
import { connectBunker } from '@src/nostr/bunker';
import { getConnection, saveConnection } from '@src/nostr/connections';

import { createBunkerUsageRepresentation } from '../usage/representation';

import type { BunkerAddRepresentation } from './representation';

type HandleBunkerAddProps = {
  db: CoreDb;
  pool: SimplePool;
  args: string[];
};

export type BunkerAddHandlerResult =
  | ReturnType<typeof createBunkerUsageRepresentation>
  | BunkerAddRepresentation;

export async function handleBunkerAdd(
  props: HandleBunkerAddProps,
): Promise<BunkerAddHandlerResult> {
  const { db, pool, args } = props;
  const name = args[1]?.trim();
  const bunkerUrl = args[2]?.trim();

  if (!name || !bunkerUrl) {
    return createBunkerUsageRepresentation();
  }

  if (getConnection(db, name)) {
    return {
      kind: 'bunker.add',
      version: 1,
      meta: { command: 'bunker', subcommand: 'add' },
      data: { view: 'duplicate', name },
    };
  }

  const data = await connectBunker(pool, bunkerUrl);

  saveConnection(db, name, 'bunker', {
    relays: data.relays,
    ephemeralSecret: data.ephemeralSecret,
    ephemeralPubkey: data.ephemeralPubkey,
    remoteSignerPubkey: data.remoteSignerPubkey,
    userPubkey: data.userPubkey,
  });

  return {
    kind: 'bunker.add',
    version: 1,
    meta: { command: 'bunker', subcommand: 'add' },
    data: {
      view: 'success',
      name,
      userPubkey: data.userPubkey,
      remoteSignerPubkey: data.remoteSignerPubkey,
      relays: data.relays,
    },
  };
}
