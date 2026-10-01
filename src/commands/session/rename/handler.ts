import type { CoreDb, WorkspaceTarget } from '@src/db';
import { renameAppWeaverSession } from '@src/session';

import type { SessionRenameRepresentation } from './representation';

type HandleSessionRenameProps = {
  db: CoreDb;
  sessionId: string;
  workspace: WorkspaceTarget;
  title: string;
  prefix: string;
};

export function handleSessionRename({
  db,
  sessionId,
  workspace,
  title,
  prefix,
}: HandleSessionRenameProps): SessionRenameRepresentation {
  if (!sessionId || !title.trim()) {
    return {
      kind: 'session.rename',
      version: 1,
      meta: { command: 'session', subcommand: 'rename' },
      data: { view: 'usage', prefix },
    };
  }

  const result = renameAppWeaverSession({
    db,
    sessionId,
    workspace,
    title,
    mode: 'manual',
  });

  return {
    kind: 'session.rename',
    version: 1,
    meta: { command: 'session', subcommand: 'rename' },
    data: { view: 'success', sessionId, title: result.title ?? title.trim() },
  };
}
