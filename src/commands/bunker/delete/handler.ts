import type { CoreDb } from '@src/db';
import { deleteConnection } from '@src/nostr/connections';

import { createBunkerUsageRepresentation } from '../usage/representation';

import type { BunkerDeleteRepresentation } from './representation';

type HandleBunkerDeleteProps = {
  db: CoreDb;
  args: string[];
};

export type BunkerDeleteHandlerResult =
  | ReturnType<typeof createBunkerUsageRepresentation>
  | BunkerDeleteRepresentation;

export function handleBunkerDelete(
  props: HandleBunkerDeleteProps,
): BunkerDeleteHandlerResult {
  const { db, args } = props;
  const name = args[1]?.trim();

  if (!name) {
    return createBunkerUsageRepresentation();
  }

  const deleted = deleteConnection(db, name);

  return {
    kind: 'bunker.delete',
    version: 1,
    meta: { command: 'bunker', subcommand: 'delete' },
    data: deleted ? { view: 'success', name } : { view: 'missing', name },
  };
}
