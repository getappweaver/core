import type { NostrCacheDb } from './db';

export const DEFAULT_NOSTR_CACHE_MAX_BYTES = 250 * 1024 * 1024;
export const DEFAULT_NOSTR_CACHE_MAX_EVENTS = 100_000;
export const DEFAULT_NOSTR_CACHE_PRUNE_RATIO = 0.8;
export const NOSTR_CACHE_MAINTENANCE_WRITE_BATCH_SIZE = 100;
const MAINTENANCE_DELETE_BATCH_SIZE = 1_000;

type CacheTableStats = {
  rows: number;
  bytes: number;
};

export type NostrCacheStats = {
  regular: CacheTableStats;
  replaceable: CacheTableStats;
  combined: CacheTableStats;
};

export type NostrCacheLimits = {
  maxBytes: number;
  maxEvents: number;
  pruneRatio: number;
};

export type NostrCacheMaintenanceResult = {
  before: NostrCacheStats;
  after: NostrCacheStats;
  evictedRows: number;
  evictedBytes: number;
};

type RunNostrCacheMaintenanceProps = {
  db: NostrCacheDb;
  limits: NostrCacheLimits;
};

type EvictionCandidate = {
  cache_table: 'regular' | 'replaceable';
  event_id: string;
  kind: number | null;
  pubkey: string | null;
  identifier: string | null;
  size_bytes: number;
};

export const DEFAULT_NOSTR_CACHE_LIMITS: NostrCacheLimits = {
  maxBytes: DEFAULT_NOSTR_CACHE_MAX_BYTES,
  maxEvents: DEFAULT_NOSTR_CACHE_MAX_EVENTS,
  pruneRatio: DEFAULT_NOSTR_CACHE_PRUNE_RATIO,
};

const pendingWritesByDb = new WeakMap<NostrCacheDb, number>();

export function getNostrCacheStats(db: NostrCacheDb): NostrCacheStats {
  const regular = db
    .prepare(
      'SELECT COUNT(*) AS rows, COALESCE(SUM(size_bytes), 0) AS bytes FROM nostr_events',
    )
    .get() as CacheTableStats;

  const replaceable = db
    .prepare(
      'SELECT COUNT(*) AS rows, COALESCE(SUM(size_bytes), 0) AS bytes FROM nostr_replaceable_events',
    )
    .get() as CacheTableStats;

  return {
    regular,
    replaceable,
    combined: {
      rows: regular.rows + replaceable.rows,
      bytes: regular.bytes + replaceable.bytes,
    },
  };
}

export function noteNostrCacheWrite(db: NostrCacheDb): void {
  const pendingWrites = (pendingWritesByDb.get(db) ?? 0) + 1;

  if (pendingWrites < NOSTR_CACHE_MAINTENANCE_WRITE_BATCH_SIZE) {
    pendingWritesByDb.set(db, pendingWrites);

    return;
  }

  pendingWritesByDb.set(db, 0);
  runNostrCacheMaintenance({ db, limits: DEFAULT_NOSTR_CACHE_LIMITS });
}

export function runNostrCacheMaintenance({
  db,
  limits,
}: RunNostrCacheMaintenanceProps): NostrCacheMaintenanceResult {
  const before = getNostrCacheStats(db);

  if (
    before.combined.rows <= limits.maxEvents &&
    before.combined.bytes <= limits.maxBytes
  ) {
    return { before, after: before, evictedRows: 0, evictedBytes: 0 };
  }

  const targetRows = Math.floor(limits.maxEvents * limits.pruneRatio);
  const targetBytes = Math.floor(limits.maxBytes * limits.pruneRatio);
  let remainingRows = before.combined.rows;
  let remainingBytes = before.combined.bytes;
  let evictedRows = 0;
  let evictedBytes = 0;

  while (remainingRows > targetRows || remainingBytes > targetBytes) {
    const candidates = db
      .prepare(
        `SELECT cache_table, event_id, kind, pubkey, identifier, size_bytes
         FROM (
           SELECT 'regular' AS cache_table, event_id, NULL AS kind,
                  NULL AS pubkey, NULL AS identifier, size_bytes,
                  last_accessed_at, cached_at
           FROM nostr_events
           UNION ALL
           SELECT 'replaceable' AS cache_table, event_id, kind, pubkey,
                  identifier, size_bytes, last_accessed_at, cached_at
           FROM nostr_replaceable_events
         )
         ORDER BY last_accessed_at ASC, cached_at ASC, event_id ASC
         LIMIT ?`,
      )
      .all(MAINTENANCE_DELETE_BATCH_SIZE) as EvictionCandidate[];

    if (candidates.length === 0) {
      break;
    }

    const toDelete: EvictionCandidate[] = [];

    for (const candidate of candidates) {
      if (remainingRows <= targetRows && remainingBytes <= targetBytes) {
        break;
      }

      toDelete.push(candidate);
      remainingRows -= 1;
      remainingBytes -= candidate.size_bytes;
    }

    db.transaction(() => {
      for (const candidate of toDelete) {
        if (candidate.cache_table === 'regular') {
          db.run('DELETE FROM nostr_events WHERE event_id = ?', [
            candidate.event_id,
          ]);
        } else {
          db.run(
            `DELETE FROM nostr_replaceable_events
             WHERE kind = ? AND pubkey = ? AND identifier = ?`,
            [candidate.kind, candidate.pubkey, candidate.identifier],
          );
        }
      }
    })();

    evictedRows += toDelete.length;

    evictedBytes += toDelete.reduce(
      (total, candidate) => total + candidate.size_bytes,
      0,
    );
  }

  return {
    before,
    after: getNostrCacheStats(db),
    evictedRows,
    evictedBytes,
  };
}
