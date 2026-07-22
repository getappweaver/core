import { Database } from 'bun:sqlite';

import { NOSTR_CACHE_DB_PATH } from '../../paths';
import type { Brand } from '../../types';

export type NostrCacheDb = Brand<Database, 'NostrCacheDb'>;

export function createNostrCacheTables(db: NostrCacheDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS nostr_events (
      event_id TEXT PRIMARY KEY,
      event_json TEXT NOT NULL,
      pubkey TEXT NOT NULL,
      kind INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      relay_hints_json TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      cached_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_nostr_events_author_kind_created
    ON nostr_events (pubkey, kind, created_at DESC, event_id DESC)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nostr_replaceable_events (
      kind INTEGER NOT NULL,
      pubkey TEXT NOT NULL,
      identifier TEXT NOT NULL DEFAULT '',
      event_id TEXT NOT NULL,
      event_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      relay_hints_json TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      cached_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL,
      last_checked_at INTEGER NOT NULL,
      PRIMARY KEY (kind, pubkey, identifier)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_nostr_replaceable_author_kind_created
    ON nostr_replaceable_events (pubkey, kind, created_at DESC, event_id DESC)
  `);
}

export function openNostrCacheDb(
  dbPath: string = NOSTR_CACHE_DB_PATH,
): NostrCacheDb {
  const db = new Database(dbPath) as NostrCacheDb;

  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA busy_timeout = 5000');
  createNostrCacheTables(db);

  return db;
}

export function closeNostrCacheDb(db: NostrCacheDb): void {
  db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
}
