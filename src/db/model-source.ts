import type { CoreDb, WorkspaceTarget } from './shared';

export const CORE_MODEL_SOURCE_PROVIDER_ID =
  'appweaver-core/ai-model-source/v1';
export const DEFAULT_RECENT_MODEL_LIMIT = 5;

export function createModelSourceTables(db: CoreDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS model_source_settings (
      workspace_target TEXT PRIMARY KEY CHECK (workspace_target IN ('parent', 'appweaver')),
      active_provider_id TEXT NOT NULL,
      recent_model_limit INTEGER NOT NULL DEFAULT 5 CHECK (recent_model_limit BETWEEN 1 AND 50)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS model_source_favorites (
      workspace_target TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_target, provider_id, model_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS core_model_selection (
      workspace_target TEXT PRIMARY KEY CHECK (workspace_target IN ('parent', 'appweaver')),
      model_id TEXT
    )
  `);

  const legacy = db
    .prepare(
      "SELECT value FROM state WHERE key IN ('model_override:opencode', 'model_override:opencode-sdk') ORDER BY CASE key WHEN 'model_override:opencode' THEN 0 ELSE 1 END LIMIT 1",
    )
    .get() as { value: string } | undefined;

  if (legacy) {
    for (const workspace of ['parent', 'appweaver'] as const) {
      db.run(
        'INSERT OR IGNORE INTO core_model_selection (workspace_target, model_id) VALUES (?, ?)',
        [workspace, legacy.value],
      );
    }

    db.run(
      "DELETE FROM state WHERE key IN ('model_override:opencode', 'model_override:opencode-sdk')",
    );
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS model_source_recents (
      workspace_target TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      last_used_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_target, provider_id, model_id)
    )
  `);

  for (const workspace of ['parent', 'appweaver'] as const) {
    db.run(
      `INSERT OR IGNORE INTO model_source_settings
       (workspace_target, active_provider_id, recent_model_limit)
       VALUES (?, ?, ?)`,
      [workspace, CORE_MODEL_SOURCE_PROVIDER_ID, DEFAULT_RECENT_MODEL_LIMIT],
    );
  }

  // Routstr becomes a model-source plugin later; stale core state must not affect runs.
  db.run(
    "DELETE FROM state WHERE key IN ('routstr_model', 'routstr_models_cache', 'routstr_models_cache_ts')",
  );
}

export function getCoreSelectedModel(
  db: CoreDb,
  workspaceTarget: WorkspaceTarget,
): string | null {
  const row = db
    .prepare(
      'SELECT model_id FROM core_model_selection WHERE workspace_target = ?',
    )
    .get(workspaceTarget) as { model_id: string | null } | undefined;

  return row?.model_id ?? null;
}

export function setCoreSelectedModel(
  db: CoreDb,
  workspaceTarget: WorkspaceTarget,
  modelId: string | null,
): void {
  db.run(
    'INSERT INTO core_model_selection (workspace_target, model_id) VALUES (?, ?) ON CONFLICT(workspace_target) DO UPDATE SET model_id = excluded.model_id',
    [workspaceTarget, modelId],
  );
}

export function getActiveModelSourceProviderId(
  db: CoreDb,
  workspaceTarget: WorkspaceTarget,
): string {
  const row = db
    .prepare(
      'SELECT active_provider_id FROM model_source_settings WHERE workspace_target = ?',
    )
    .get(workspaceTarget) as { active_provider_id: string } | undefined;

  return row?.active_provider_id ?? CORE_MODEL_SOURCE_PROVIDER_ID;
}

export function setActiveModelSourceProviderId(
  db: CoreDb,
  workspaceTarget: WorkspaceTarget,
  providerId: string,
): void {
  db.run(
    `INSERT INTO model_source_settings
     (workspace_target, active_provider_id, recent_model_limit)
     VALUES (?, ?, ?)
     ON CONFLICT(workspace_target) DO UPDATE SET active_provider_id = excluded.active_provider_id`,
    [workspaceTarget, providerId, DEFAULT_RECENT_MODEL_LIMIT],
  );
}

export function getRecentModelLimit(
  db: CoreDb,
  workspaceTarget: WorkspaceTarget,
): number {
  const row = db
    .prepare(
      'SELECT recent_model_limit FROM model_source_settings WHERE workspace_target = ?',
    )
    .get(workspaceTarget) as { recent_model_limit: number } | undefined;

  return row?.recent_model_limit ?? DEFAULT_RECENT_MODEL_LIMIT;
}

export function setRecentModelLimit(
  db: CoreDb,
  workspaceTarget: WorkspaceTarget,
  limit: number,
): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Recent model limit must be an integer between 1 and 50.');
  }

  db.run(
    `UPDATE model_source_settings SET recent_model_limit = ? WHERE workspace_target = ?`,
    [limit, workspaceTarget],
  );

  pruneRecentModels(
    db,
    workspaceTarget,
    getActiveModelSourceProviderId(db, workspaceTarget),
  );
}

export function listFavoriteModelIds(
  db: CoreDb,
  workspaceTarget: WorkspaceTarget,
  providerId: string,
): Set<string> {
  const rows = db
    .prepare(
      `SELECT model_id FROM model_source_favorites
       WHERE workspace_target = ? AND provider_id = ?`,
    )
    .all(workspaceTarget, providerId) as Array<{ model_id: string }>;

  return new Set(rows.map((row) => row.model_id));
}

export function setModelFavorite(props: {
  db: CoreDb;
  workspaceTarget: WorkspaceTarget;
  providerId: string;
  modelId: string;
  favorite: boolean;
}): void {
  if (props.favorite) {
    props.db.run(
      `INSERT OR IGNORE INTO model_source_favorites
       (workspace_target, provider_id, model_id, created_at) VALUES (?, ?, ?, ?)`,
      [props.workspaceTarget, props.providerId, props.modelId, Date.now()],
    );
  } else {
    props.db.run(
      `DELETE FROM model_source_favorites
       WHERE workspace_target = ? AND provider_id = ? AND model_id = ?`,
      [props.workspaceTarget, props.providerId, props.modelId],
    );
  }
}

export function listRecentModels(
  db: CoreDb,
  workspaceTarget: WorkspaceTarget,
  providerId: string,
): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT model_id, last_used_at FROM model_source_recents
       WHERE workspace_target = ? AND provider_id = ? ORDER BY last_used_at DESC`,
    )
    .all(workspaceTarget, providerId) as Array<{
    model_id: string;
    last_used_at: number;
  }>;

  return new Map(rows.map((row) => [row.model_id, row.last_used_at]));
}

function pruneRecentModels(
  db: CoreDb,
  workspaceTarget: WorkspaceTarget,
  providerId: string,
): void {
  const limit = getRecentModelLimit(db, workspaceTarget);

  db.run(
    `DELETE FROM model_source_recents
     WHERE workspace_target = ? AND provider_id = ? AND model_id NOT IN (
       SELECT model_id FROM model_source_recents
       WHERE workspace_target = ? AND provider_id = ?
       ORDER BY last_used_at DESC LIMIT ?
     )`,
    [workspaceTarget, providerId, workspaceTarget, providerId, limit],
  );
}

export function recordRecentModelUse(props: {
  db: CoreDb;
  workspaceTarget: WorkspaceTarget;
  providerId: string;
  modelId: string;
  usedAt: number;
}): void {
  props.db.run(
    `INSERT INTO model_source_recents
     (workspace_target, provider_id, model_id, last_used_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(workspace_target, provider_id, model_id)
     DO UPDATE SET last_used_at = excluded.last_used_at`,
    [props.workspaceTarget, props.providerId, props.modelId, props.usedAt],
  );

  pruneRecentModels(props.db, props.workspaceTarget, props.providerId);
}
