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
  WorkspaceTargetSchema,
} from './db';
import { notifySessionTitleUpdated } from './session-title-notifications';

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
    'INSERT OR IGNORE INTO sessions (id, created_at, backend, workspace, updated_at, last_read_message_created_at, last_read_message_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, now, backend.name, workspace, now, 0, ''],
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

export type AppWeaverSession = {
  id: string;
  title: string | null;
  updatedAt: number;
};

export function listAppWeaverSessions(
  db: CoreDb,
  workspace: WorkspaceTarget,
  limit: number,
): AppWeaverSession[] {
  const rows = db
    .prepare(
      'SELECT id, title, COALESCE(updated_at, created_at) AS updated_at FROM sessions WHERE workspace = ? AND backend = ? ORDER BY updated_at DESC, id DESC LIMIT ?',
    )
    .all(workspace, 'opencode', limit) as Array<{
    id: string;
    title: string | null;
    updated_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
}

export type RenameAppWeaverSessionProps = {
  db: CoreDb;
  sessionId: string;
  workspace: WorkspaceTarget;
  title: string;
  mode: 'manual' | 'auto';
};

export type RenameAppWeaverSessionResult = {
  status: 'updated' | 'unchanged' | 'manual-title';
  title: string | null;
};

export function getAppWeaverSessionTitle(
  db: CoreDb,
  sessionId: string,
): string | null {
  const row = db
    .prepare('SELECT title FROM sessions WHERE id = ?')
    .get(sessionId) as { title: string | null } | undefined;

  return row?.title ?? null;
}

export function getAppWeaverSessionWorkspace(
  db: CoreDb,
  sessionId: string,
): WorkspaceTarget {
  const row = db
    .prepare('SELECT workspace FROM sessions WHERE id = ? AND backend = ?')
    .get(sessionId, 'opencode') as { workspace: string | null } | undefined;

  const workspace = WorkspaceTargetSchema.safeParse(row?.workspace);

  if (!workspace.success) {
    throw new Error(
      `Session ${sessionId} is not tracked in an AppWeaver workspace.`,
    );
  }

  return workspace.data;
}

export function renameAppWeaverSession({
  db,
  sessionId,
  workspace,
  title,
  mode,
}: RenameAppWeaverSessionProps): RenameAppWeaverSessionResult {
  const normalized = title.trim().replace(/\s+/g, ' ');
  const maxLength = mode === 'auto' ? 30 : 120;

  if (!normalized || Array.from(normalized).length > maxLength) {
    throw new Error(`Session title must contain 1 to ${maxLength} characters.`);
  }

  assertWebSession(db, sessionId, workspace);

  const current = db
    .prepare('SELECT title, title_origin FROM sessions WHERE id = ?')
    .get(sessionId) as { title: string | null; title_origin: string };

  if (
    mode === 'auto' &&
    current.title !== null &&
    current.title_origin !== 'auto'
  ) {
    return { status: 'manual-title', title: current.title };
  }

  if (current.title === normalized && current.title_origin === mode) {
    return { status: 'unchanged', title: current.title };
  }

  const update = db
    .prepare(
      `UPDATE sessions SET title = ?, title_origin = ?
       WHERE id = ? AND workspace = ? AND (title IS NULL OR title_origin = 'auto' OR ? = 'manual')`,
    )
    .run(normalized, mode, sessionId, workspace, mode);

  if (update.changes === 0) {
    return {
      status: 'manual-title',
      title: getAppWeaverSessionTitle(db, sessionId),
    };
  }

  notifySessionTitleUpdated(db);

  return { status: 'updated', title: normalized };
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
