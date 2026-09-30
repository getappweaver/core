import type { CoreDb, WorkspaceTarget } from '@src/db';

export function getSelectedWebSessionId(
  db: CoreDb,
  requestedSessionId: string | null,
  workspace: WorkspaceTarget,
): string | null {
  if (!requestedSessionId) {
    return null;
  }

  const session = db
    .prepare(
      'SELECT id FROM sessions WHERE id = ? AND workspace = ? AND backend = ?',
    )
    .get(requestedSessionId, workspace, 'opencode');

  return session ? requestedSessionId : null;
}
