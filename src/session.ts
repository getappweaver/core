// ---------------------------------------------------------------------------
// session.ts — Session CRUD and management
// ---------------------------------------------------------------------------
import type { AgentBackend } from './backends/types';
import type { AgentBackendName, CoreDb, WorkspaceTarget } from './db';
import {
  getState,
  setState,
  STATE_CURRENT_SESSION,
  webSessionStateKey,
} from './db';

export type CreateNewSessionProps = {
  db: CoreDb;
  backend: AgentBackend;
  cwd: string;
  workspace: WorkspaceTarget;
  selection: 'web' | 'dm';
};

export async function createNewSession({
  db,
  backend,
  cwd,
  workspace,
  selection,
}: CreateNewSessionProps): Promise<string> {
  const id = await backend.createSession(cwd);
  const now = Math.floor(Date.now() / 1000);

  db.run(
    'INSERT OR IGNORE INTO sessions (id, created_at, backend, workspace, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, now, backend.name, workspace, now],
  );

  setState(
    db,
    selection === 'web' ? webSessionStateKey(workspace) : STATE_CURRENT_SESSION,
    id,
  );

  return id;
}

export function getLatestSession(
  db: CoreDb,
  backendName: AgentBackendName,
  workspace: WorkspaceTarget,
): string | null {
  const row = db
    .prepare(
      'SELECT id FROM sessions WHERE backend = ? AND workspace = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1',
    )
    .get(backendName, workspace) as { id: string } | undefined;

  return row?.id ?? null;
}

export type GetOrCreateSessionProps = {
  db: CoreDb;
  backend: AgentBackend;
  cwd: string;
  workspace: WorkspaceTarget;
  selection: 'web' | 'dm';
};

export async function getOrCreateCurrentSession({
  db,
  backend,
  cwd,
  workspace,
  selection,
}: GetOrCreateSessionProps): Promise<string> {
  const key =
    selection === 'web' ? webSessionStateKey(workspace) : STATE_CURRENT_SESSION;

  const cur = getState(db, key);

  if (cur) {
    const exists = db
      .prepare(
        'SELECT 1 FROM sessions WHERE id = ? AND backend = ? AND workspace = ?',
      )
      .get(cur, backend.name, workspace);

    if (exists) {
      return cur;
    }
  }

  return createNewSession({ db, backend, cwd, workspace, selection });
}

export function setCurrentSession(
  db: CoreDb,
  sessionId: string,
  workspace: WorkspaceTarget,
  selection: 'web' | 'dm',
): boolean {
  const exists = db
    .prepare('SELECT 1 FROM sessions WHERE id = ? AND workspace = ?')
    .get(sessionId, workspace);

  if (!exists) {
    return false;
  }

  setState(
    db,
    selection === 'web' ? webSessionStateKey(workspace) : STATE_CURRENT_SESSION,
    sessionId,
  );

  return true;
}

export function assertWebSession(
  db: CoreDb,
  sessionId: string,
  workspace: WorkspaceTarget,
): void {
  const row = db
    .prepare(
      'SELECT 1 FROM sessions WHERE id = ? AND workspace = ? AND backend = ?',
    )
    .get(sessionId, workspace, 'opencode');

  if (!row) {
    throw new Error('Session does not belong to the active workspace.');
  }
}

export function insertSessionMessage(
  db: CoreDb,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): void {
  const now = Math.floor(Date.now() / 1000);

  db.run(
    'INSERT INTO session_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)',
    [sessionId, role, content, now],
  );

  db.run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);
}
