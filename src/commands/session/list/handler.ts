import type { CoreDb, WorkspaceTarget } from '@src/db';
import { getState, STATE_CURRENT_SESSION, webSessionStateKey } from '@src/db';

import type { SessionListRepresentation } from './representation';

type HandleSessionListProps = {
  db: CoreDb;
  limit?: number;
  workspace: WorkspaceTarget;
  selection: 'web' | 'dm';
};

const DEFAULT_SESSION_LIST_LIMIT = 20;
const MAX_SESSION_LIST_LIMIT = 200;

export function handleSessionList(
  props: HandleSessionListProps,
): SessionListRepresentation {
  const limit = props.limit ?? DEFAULT_SESSION_LIST_LIMIT;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SESSION_LIST_LIMIT) {
    throw new Error(
      `Session list limit must be an integer from 1 to ${MAX_SESSION_LIST_LIMIT}.`,
    );
  }

  const rows = props.db
    .prepare(
      'SELECT id, title, created_at, backend FROM sessions WHERE workspace = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?',
    )
    .all(props.workspace, limit) as {
    id: string;
    title: string | null;
    created_at: number;
    backend: string;
  }[];

  if (rows.length === 0) {
    return {
      kind: 'session.list',
      version: 1,
      meta: { command: 'session', subcommand: 'list' },
      data: { view: 'empty' },
    };
  }

  const cur = getState(
    props.db,
    props.selection === 'web'
      ? webSessionStateKey(props.workspace)
      : STATE_CURRENT_SESSION,
  );

  return {
    kind: 'session.list',
    version: 1,
    meta: { command: 'session', subcommand: 'list' },
    data: {
      view: 'rows',
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        backend: r.backend ?? 'opencode',
        createdAtIso: new Date(r.created_at * 1000).toISOString(),
        isCurrent: r.id === cur,
      })),
    },
  };
}
