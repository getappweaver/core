import { mkdirSync, watch, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

import type { CoreDb, WorkspaceTarget } from './db';
import { log } from './logger';

export type SessionTitleUpdate = {
  sessionId: string;
  workspace: WorkspaceTarget;
  title: string | null;
};

function notificationPath(db: CoreDb): string | null {
  if (!db.filename || db.filename === ':memory:') {
    return null;
  }

  return join(
    dirname(db.filename),
    '.logs',
    `${basename(db.filename)}.session-titles`,
  );
}

// The agent CLI runs in another process, so an in-memory event cannot reach
// the web server. This signal is written only after the title is committed.
export function notifySessionTitleUpdated(db: CoreDb): void {
  const path = notificationPath(db);

  if (!path) {
    return;
  }

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, String(Date.now()));
  } catch (error) {
    log.warn(`[session-title] Could not signal title update: ${String(error)}`);
  }
}

export function watchSessionTitles(
  db: CoreDb,
  onUpdate: (update: SessionTitleUpdate) => void,
): () => void {
  const path = notificationPath(db);

  if (!path) {
    return () => {};
  }

  mkdirSync(dirname(path), { recursive: true });

  const readTitles = () =>
    db
      .prepare(
        "SELECT id AS sessionId, workspace, title FROM sessions WHERE backend = 'opencode' AND workspace IN ('parent', 'appweaver')",
      )
      .all() as SessionTitleUpdate[];

  let titles = new Map(readTitles().map((row) => [row.sessionId, row.title]));

  const watcher = watch(dirname(path), (_event, filename) => {
    if (filename !== basename(path)) {
      return;
    }

    // Read the database, rather than the signal contents: filesystem events
    // may coalesce when multiple sessions are renamed at the same time.
    const rows = readTitles();
    const previous = titles;
    titles = new Map(rows.map((row) => [row.sessionId, row.title]));

    for (const row of rows) {
      if (previous.get(row.sessionId) !== row.title) {
        onUpdate(row);
      }
    }
  });

  watcher.on('error', (error) => {
    log.warn(
      `[session-title] Title notification watcher failed: ${String(error)}`,
    );
  });

  return () => watcher.close();
}
