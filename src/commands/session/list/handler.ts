import type { CoreDb } from '@src/db';
import { getState, STATE_CURRENT_SESSION } from '@src/db';

import type { SessionListRepresentation } from './representation';

type HandleSessionListProps = {
  db: CoreDb;
};

export function handleSessionList(
  props: HandleSessionListProps,
): SessionListRepresentation {
  const rows = props.db
    .prepare(
      'SELECT id, created_at, backend FROM sessions ORDER BY created_at DESC',
    )
    .all() as { id: string; created_at: number; backend: string }[];

  if (rows.length === 0) {
    return {
      kind: 'session.list',
      version: 1,
      meta: { command: 'session', subcommand: 'list' },
      data: { view: 'empty' },
    };
  }

  const cur = getState(props.db, STATE_CURRENT_SESSION);

  return {
    kind: 'session.list',
    version: 1,
    meta: { command: 'session', subcommand: 'list' },
    data: {
      view: 'rows',
      rows: rows.map((r) => ({
        id: r.id,
        backend: r.backend ?? 'opencode',
        createdAtIso: new Date(r.created_at * 1000).toISOString(),
        isCurrent: r.id === cur,
      })),
    },
  };
}
