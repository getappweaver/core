import { z } from 'zod';

import type { CoreDb } from './shared';

const HexPubkeySchema = z.string().regex(/^[0-9a-f]{64}$/);

const NullableTextSchema = z.preprocess(
  (value) => (value == null ? null : String(value)),
  z.string().nullable(),
);

const SqliteIntSchema = z.coerce.number().int().nonnegative();

export const WotNodeRowSchema = z.object({
  root_pubkey: HexPubkeySchema,
  pubkey: HexPubkeySchema,
  depth: SqliteIntSchema,
  contact_list_created_at: SqliteIntSchema,
  follow_list_fetched_at: SqliteIntSchema,
  source_event_id: NullableTextSchema,
});

export type WotNodeRow = z.infer<typeof WotNodeRowSchema>;

export const WotEdgeRowSchema = z.object({
  root_pubkey: HexPubkeySchema,
  follower_pubkey: HexPubkeySchema,
  followed_pubkey: HexPubkeySchema,
  relay_hint: NullableTextSchema,
  nickname: NullableTextSchema,
  contact_list_created_at: SqliteIntSchema,
});

export type WotEdgeRow = z.infer<typeof WotEdgeRowSchema>;

export const WotRootStatsSchema = z.object({
  root_pubkey: HexPubkeySchema,
  node_count: SqliteIntSchema,
  edge_count: SqliteIntSchema,
  max_depth: SqliteIntSchema,
  last_fetched_at: SqliteIntSchema,
});

export type WotRootStats = z.infer<typeof WotRootStatsSchema>;

export const WotScoreSchema = z.object({
  pubkey: HexPubkeySchema,
  root_pubkey: HexPubkeySchema,
  depth: SqliteIntSchema,
  score: z.number().nonnegative().nullable(),
});

export type WotScore = z.infer<typeof WotScoreSchema>;

export const WotScoreDetailsSchema = z.object({
  pubkey: HexPubkeySchema,
  root_pubkey: HexPubkeySchema,
  depth: SqliteIntSchema,
  score: z.number().nonnegative().nullable(),
  score_percent: z.number().nonnegative().nullable(),
  base_score: z.number().nonnegative().nullable(),
  following_count: SqliteIntSchema,
  follower_count: SqliteIntSchema,
  weighted_support: z.number().nonnegative(),
  normalized_support: z.number().min(0).max(1),
});

export type WotScoreDetails = z.infer<typeof WotScoreDetailsSchema>;

/**
 * WoT stores one root-relative graph snapshot per crawl.
 *
 * - `wot_nodes` keeps node-level facts for one `(root_pubkey, pubkey)` pair.
 * - `wot_edges` keeps directed follow edges discovered from fetched contact lists.
 * - Full replacement is per root: clear the old snapshot, then write the new one.
 * - `follow_list_fetched_at` means when we fetched this pubkey's own kind:3 list.
 * - `relay_hint` and `nickname` are last-seen contact-list tag metadata, not profile truth.
 */
export function createWotTables(db: CoreDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS wot_nodes (
      root_pubkey TEXT NOT NULL,
      pubkey TEXT NOT NULL,
      depth INTEGER NOT NULL,
      contact_list_created_at INTEGER NOT NULL,
      follow_list_fetched_at INTEGER NOT NULL,
      source_event_id TEXT,
      PRIMARY KEY (root_pubkey, pubkey)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wot_edges (
      root_pubkey TEXT NOT NULL,
      follower_pubkey TEXT NOT NULL,
      followed_pubkey TEXT NOT NULL,
      relay_hint TEXT,
      nickname TEXT,
      contact_list_created_at INTEGER NOT NULL,
      PRIMARY KEY (root_pubkey, follower_pubkey, followed_pubkey)
    )
  `);

  db.run(
    'CREATE INDEX IF NOT EXISTS idx_wot_nodes_root_depth ON wot_nodes (root_pubkey, depth)',
  );

  db.run(
    'CREATE INDEX IF NOT EXISTS idx_wot_edges_root_followed ON wot_edges (root_pubkey, followed_pubkey)',
  );

  db.run(
    'CREATE INDEX IF NOT EXISTS idx_wot_edges_root_follower ON wot_edges (root_pubkey, follower_pubkey)',
  );

  db.run(`
    CREATE TABLE IF NOT EXISTS wot_contact_list_cache (
      pubkey     TEXT PRIMARY KEY,
      event_id   TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      follows    TEXT NOT NULL,
      raw_json   TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wot_relay_list_cache (
      pubkey       TEXT PRIMARY KEY,
      event_id     TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      read_relays  TEXT NOT NULL,
      write_relays TEXT NOT NULL,
      raw_json     TEXT NOT NULL,
      fetched_at   INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wot_profile_cache (
      pubkey       TEXT PRIMARY KEY,
      event_id     TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      name         TEXT,
      display_name TEXT,
      picture      TEXT,
      about        TEXT,
      raw_json     TEXT NOT NULL,
      fetched_at   INTEGER NOT NULL
    )
  `);
}

export type CachedContactList = {
  pubkey: string;
  eventId: string;
  createdAt: number;
  follows: string[];
  fetchedAt: number;
};

export type CachedRelayList = {
  pubkey: string;
  eventId: string;
  createdAt: number;
  readRelays: string[];
  writeRelays: string[];
  fetchedAt: number;
};

export type CachedProfile = {
  pubkey: string;
  eventId: string;
  createdAt: number;
  name: string | null;
  displayName: string | null;
  picture: string | null;
  about: string | null;
  fetchedAt: number;
};

export type LegacyWotEventKind = 0 | 3 | 10002;

export type LegacyWotEvent = {
  kind: LegacyWotEventKind;
  pubkey: string;
  eventId: string;
  createdAt: number;
  fetchedAt: number;
  rawJson: string;
};

function legacyWotTable(kind: LegacyWotEventKind): string {
  if (kind === 0) {
    return 'wot_profile_cache';
  }

  if (kind === 3) {
    return 'wot_contact_list_cache';
  }

  return 'wot_relay_list_cache';
}

export function getLegacyWotEvent({
  db,
  kind,
  pubkey,
}: {
  db: CoreDb;
  kind: LegacyWotEventKind;
  pubkey: string;
}): LegacyWotEvent | null {
  const row = db
    .prepare(
      `SELECT pubkey, event_id, created_at, fetched_at, raw_json
       FROM ${legacyWotTable(kind)} WHERE pubkey = ?`,
    )
    .get(pubkey.toLowerCase()) as
    | {
        pubkey: string;
        event_id: string;
        created_at: number;
        fetched_at: number;
        raw_json: string;
      }
    | undefined;

  return row
    ? {
        kind,
        pubkey: row.pubkey,
        eventId: row.event_id,
        createdAt: row.created_at,
        fetchedAt: row.fetched_at,
        rawJson: row.raw_json,
      }
    : null;
}

export function clearLegacyWotEvent({
  db,
  kind,
  pubkey,
  eventId,
}: {
  db: CoreDb;
  kind: LegacyWotEventKind;
  pubkey: string;
  eventId: string;
}): boolean {
  return (
    db.run(
      `UPDATE ${legacyWotTable(kind)} SET raw_json = ''
       WHERE pubkey = ? AND event_id = ? AND raw_json <> ''`,
      [pubkey.toLowerCase(), eventId.toLowerCase()],
    ).changes > 0
  );
}

export function getCachedContactList(
  db: CoreDb,
  pubkey: string,
): CachedContactList | null {
  const row = db
    .prepare('SELECT * FROM wot_contact_list_cache WHERE pubkey = ?')
    .get(pubkey.toLowerCase()) as
    | {
        pubkey: string;
        event_id: string;
        created_at: number;
        follows: string;
        fetched_at: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    pubkey: row.pubkey,
    eventId: row.event_id,
    createdAt: row.created_at,
    follows: JSON.parse(row.follows) as string[],
    fetchedAt: row.fetched_at,
  };
}

export function upsertCachedContactList({
  db,
  pubkey,
  eventId,
  createdAt,
  follows,
  rawJson,
}: {
  db: CoreDb;
  pubkey: string;
  eventId: string;
  createdAt: number;
  follows: string[];
  rawJson: string;
}): CachedContactList {
  const normalizedPubkey = pubkey.toLowerCase();
  const fetchedAt = Math.floor(Date.now() / 1000);

  db.run(
    `
    INSERT INTO wot_contact_list_cache
      (pubkey, event_id, created_at, follows, raw_json, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(pubkey) DO UPDATE SET
      event_id = excluded.event_id,
      created_at = excluded.created_at,
      follows = excluded.follows,
      raw_json = excluded.raw_json,
      fetched_at = excluded.fetched_at
    WHERE excluded.created_at > wot_contact_list_cache.created_at
       OR (excluded.created_at = wot_contact_list_cache.created_at
           AND excluded.event_id < wot_contact_list_cache.event_id)
  `,
    [
      normalizedPubkey,
      eventId,
      createdAt,
      JSON.stringify(follows),
      rawJson,
      fetchedAt,
    ],
  );

  return getCachedContactList(db, normalizedPubkey)!;
}

export function getCachedRelayList(
  db: CoreDb,
  pubkey: string,
): CachedRelayList | null {
  const row = db
    .prepare('SELECT * FROM wot_relay_list_cache WHERE pubkey = ?')
    .get(pubkey.toLowerCase()) as
    | {
        pubkey: string;
        event_id: string;
        created_at: number;
        read_relays: string;
        write_relays: string;
        fetched_at: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    pubkey: row.pubkey,
    eventId: row.event_id,
    createdAt: row.created_at,
    readRelays: JSON.parse(row.read_relays) as string[],
    writeRelays: JSON.parse(row.write_relays) as string[],
    fetchedAt: row.fetched_at,
  };
}

export function upsertCachedRelayList({
  db,
  pubkey,
  eventId,
  createdAt,
  readRelays,
  writeRelays,
  rawJson,
}: {
  db: CoreDb;
  pubkey: string;
  eventId: string;
  createdAt: number;
  readRelays: string[];
  writeRelays: string[];
  rawJson: string;
}): CachedRelayList {
  const normalizedPubkey = pubkey.toLowerCase();
  const fetchedAt = Math.floor(Date.now() / 1000);

  db.run(
    `
    INSERT INTO wot_relay_list_cache
      (pubkey, event_id, created_at, read_relays, write_relays, raw_json, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pubkey) DO UPDATE SET
      event_id = excluded.event_id,
      created_at = excluded.created_at,
      read_relays = excluded.read_relays,
      write_relays = excluded.write_relays,
      raw_json = excluded.raw_json,
      fetched_at = excluded.fetched_at
    WHERE excluded.created_at > wot_relay_list_cache.created_at
       OR (excluded.created_at = wot_relay_list_cache.created_at
           AND excluded.event_id < wot_relay_list_cache.event_id)
  `,
    [
      normalizedPubkey,
      eventId,
      createdAt,
      JSON.stringify(readRelays),
      JSON.stringify(writeRelays),
      rawJson,
      fetchedAt,
    ],
  );

  return getCachedRelayList(db, normalizedPubkey)!;
}

export function getCachedProfile(
  db: CoreDb,
  pubkey: string,
): CachedProfile | null {
  const row = db
    .prepare('SELECT * FROM wot_profile_cache WHERE pubkey = ?')
    .get(pubkey.toLowerCase()) as
    | {
        pubkey: string;
        event_id: string;
        created_at: number;
        name: string | null;
        display_name: string | null;
        picture: string | null;
        about: string | null;
        fetched_at: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    pubkey: row.pubkey,
    eventId: row.event_id,
    createdAt: row.created_at,
    name: row.name,
    displayName: row.display_name,
    picture: row.picture,
    about: row.about,
    fetchedAt: row.fetched_at,
  };
}

export function getCachedProfiles(
  db: CoreDb,
  pubkeys: string[],
): Map<string, CachedProfile> {
  const profiles = new Map<string, CachedProfile>();

  for (const pubkey of pubkeys) {
    const profile = getCachedProfile(db, pubkey);

    if (profile) {
      profiles.set(profile.pubkey, profile);
    }
  }

  return profiles;
}

export function upsertCachedProfile({
  db,
  pubkey,
  eventId,
  createdAt,
  name,
  displayName,
  picture,
  about,
  rawJson,
}: {
  db: CoreDb;
  pubkey: string;
  eventId: string;
  createdAt: number;
  name: string | null;
  displayName: string | null;
  picture: string | null;
  about: string | null;
  rawJson: string;
}): CachedProfile {
  const normalizedPubkey = pubkey.toLowerCase();
  const fetchedAt = Math.floor(Date.now() / 1000);

  db.run(
    `
    INSERT INTO wot_profile_cache
      (pubkey, event_id, created_at, name, display_name, picture, about, raw_json, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pubkey) DO UPDATE SET
      event_id = excluded.event_id,
      created_at = excluded.created_at,
      name = excluded.name,
      display_name = excluded.display_name,
      picture = excluded.picture,
      about = excluded.about,
      raw_json = excluded.raw_json,
      fetched_at = excluded.fetched_at
    WHERE excluded.created_at > wot_profile_cache.created_at
       OR (excluded.created_at = wot_profile_cache.created_at
           AND excluded.event_id < wot_profile_cache.event_id)
  `,
    [
      normalizedPubkey,
      eventId,
      createdAt,
      name,
      displayName,
      picture,
      about,
      rawJson,
      fetchedAt,
    ],
  );

  return getCachedProfile(db, normalizedPubkey)!;
}

export function clearWotForRoot(db: CoreDb, rootPubkey: string): void {
  const normalizedRootPubkey = rootPubkey.toLowerCase();

  db.run('DELETE FROM wot_edges WHERE root_pubkey = ?', [normalizedRootPubkey]);
  db.run('DELETE FROM wot_nodes WHERE root_pubkey = ?', [normalizedRootPubkey]);
}

export function upsertWotNodes(db: CoreDb, rows: WotNodeRow[]): void {
  const parsedRows = z.array(WotNodeRowSchema).parse(rows);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO wot_nodes (
      root_pubkey,
      pubkey,
      depth,
      contact_list_created_at,
      follow_list_fetched_at,
      source_event_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const row of parsedRows) {
    stmt.run(
      row.root_pubkey,
      row.pubkey,
      row.depth,
      row.contact_list_created_at,
      row.follow_list_fetched_at,
      row.source_event_id,
    );
  }
}

export function replaceWotEdgesForAuthor(
  db: CoreDb,
  rootPubkey: string,
  followerPubkey: string,
  rows: WotEdgeRow[],
): void {
  const parsedRows = z.array(WotEdgeRowSchema).parse(rows);

  db.run(
    'DELETE FROM wot_edges WHERE root_pubkey = ? AND follower_pubkey = ?',
    [rootPubkey, followerPubkey],
  );

  if (parsedRows.length === 0) {
    return;
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO wot_edges (
      root_pubkey,
      follower_pubkey,
      followed_pubkey,
      relay_hint,
      nickname,
      contact_list_created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const row of parsedRows) {
    stmt.run(
      row.root_pubkey,
      row.follower_pubkey,
      row.followed_pubkey,
      row.relay_hint,
      row.nickname,
      row.contact_list_created_at,
    );
  }
}

export function getWotDepth(
  db: CoreDb,
  pubkey: string,
  rootPubkey: string,
): number | null {
  const normalizedPubkey = pubkey.toLowerCase();
  const normalizedRootPubkey = rootPubkey.toLowerCase();

  const row = db
    .prepare(
      'SELECT root_pubkey, pubkey, depth, contact_list_created_at, follow_list_fetched_at, source_event_id FROM wot_nodes WHERE root_pubkey = ? AND pubkey = ?',
    )
    .get(normalizedRootPubkey, normalizedPubkey) as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    return null;
  }

  return WotNodeRowSchema.parse(row).depth;
}

export function getWotFollowerCount(
  db: CoreDb,
  pubkey: string,
  rootPubkey: string,
): number {
  const normalizedPubkey = pubkey.toLowerCase();
  const normalizedRootPubkey = rootPubkey.toLowerCase();

  const row = db
    .prepare(
      'SELECT COUNT(*) AS follower_count FROM wot_edges WHERE root_pubkey = ? AND followed_pubkey = ?',
    )
    .get(normalizedRootPubkey, normalizedPubkey) as
    | { follower_count: number }
    | undefined;

  return SqliteIntSchema.parse(row?.follower_count ?? 0);
}

export function getWotWeightedSupport(
  db: CoreDb,
  pubkey: string,
  rootPubkey: string,
): number {
  const depth = getWotDepth(db, pubkey, rootPubkey);

  if (depth === null || depth === 0) {
    return 0;
  }

  const normalizedPubkey = pubkey.toLowerCase();
  const normalizedRootPubkey = rootPubkey.toLowerCase();

  const rows = db
    .prepare(
      `
        SELECT n.depth AS follower_depth
        FROM wot_edges e
        JOIN wot_nodes n
          ON n.root_pubkey = e.root_pubkey
         AND n.pubkey = e.follower_pubkey
        WHERE e.root_pubkey = ?
          AND e.followed_pubkey = ?
          AND n.depth > 0
      `,
    )
    .all(normalizedRootPubkey, normalizedPubkey) as Array<{
    follower_depth: number;
  }>;

  let weight = 0;

  for (const row of rows) {
    const followerDepth = SqliteIntSchema.parse(row.follower_depth);

    weight += 1 / 2 ** (followerDepth - 1);
  }

  return weight;
}

function getBaseScore(depth: number | null): number | null {
  if (depth === null || depth === 0) {
    return null;
  }

  return 100 / 2 ** (depth - 1);
}

function getSupportBonusFactor(weightedSupport: number): number {
  return Math.max(0, Math.min(1, weightedSupport));
}

export function getWotDepthCount(
  db: CoreDb,
  depth: number,
  rootPubkey: string,
): number {
  const normalizedRootPubkey = rootPubkey.toLowerCase();
  const normalizedDepth = SqliteIntSchema.parse(depth);

  const row = db
    .prepare(
      'SELECT COUNT(*) AS node_count FROM wot_nodes WHERE root_pubkey = ? AND depth = ?',
    )
    .get(normalizedRootPubkey, normalizedDepth) as
    | { node_count: number }
    | undefined;

  return SqliteIntSchema.parse(row?.node_count ?? 0);
}

export function getWotScore(
  db: CoreDb,
  pubkey: string,
  rootPubkey: string,
): number | null {
  return getWotScoreDetails(db, pubkey, rootPubkey)?.score ?? null;
}

export function getWotFollowingCount(
  db: CoreDb,
  pubkey: string,
  rootPubkey: string,
): number {
  const normalizedPubkey = pubkey.toLowerCase();
  const normalizedRootPubkey = rootPubkey.toLowerCase();

  const row = db
    .prepare(
      'SELECT COUNT(*) AS following_count FROM wot_edges WHERE root_pubkey = ? AND follower_pubkey = ?',
    )
    .get(normalizedRootPubkey, normalizedPubkey) as
    | { following_count: number }
    | undefined;

  return SqliteIntSchema.parse(row?.following_count ?? 0);
}

export function getWotScoreDetails(
  db: CoreDb,
  pubkey: string,
  rootPubkey: string,
): WotScoreDetails | null {
  const depth = getWotDepth(db, pubkey, rootPubkey);

  if (depth === null) {
    return null;
  }

  const normalizedPubkey = pubkey.toLowerCase();
  const normalizedRootPubkey = rootPubkey.toLowerCase();
  const baseScore = getBaseScore(depth);

  const weightedSupport = getWotWeightedSupport(
    db,
    normalizedPubkey,
    normalizedRootPubkey,
  );

  const directFollowCount = getWotDepthCount(db, 1, normalizedRootPubkey);

  const normalizedSupport =
    directFollowCount === 0
      ? 0
      : Math.min(1, weightedSupport / directFollowCount);

  const score =
    baseScore === null
      ? null
      : Math.min(
          100,
          baseScore +
            (100 - baseScore) * getSupportBonusFactor(normalizedSupport),
        );

  return WotScoreDetailsSchema.parse({
    pubkey: normalizedPubkey,
    root_pubkey: normalizedRootPubkey,
    depth,
    score,
    score_percent: score,
    base_score: baseScore,
    following_count: getWotFollowingCount(
      db,
      normalizedPubkey,
      normalizedRootPubkey,
    ),
    follower_count: getWotFollowerCount(
      db,
      normalizedPubkey,
      normalizedRootPubkey,
    ),
    weighted_support: weightedSupport,
    normalized_support: normalizedSupport,
  });
}

export function getWotRootStats(
  db: CoreDb,
  rootPubkey: string,
): WotRootStats | null {
  const normalizedRootPubkey = rootPubkey.toLowerCase();

  const row = db
    .prepare(
      `
      SELECT
        ? AS root_pubkey,
        COUNT(*) AS node_count,
        COALESCE((SELECT COUNT(*) FROM wot_edges WHERE root_pubkey = ?), 0) AS edge_count,
        COALESCE(MAX(depth), 0) AS max_depth,
        COALESCE(MAX(follow_list_fetched_at), 0) AS last_fetched_at
      FROM wot_nodes
      WHERE root_pubkey = ?
    `,
    )
    .get(normalizedRootPubkey, normalizedRootPubkey, normalizedRootPubkey) as
    | Record<string, unknown>
    | undefined;

  if (!row || Number(row.node_count ?? 0) === 0) {
    return null;
  }

  return WotRootStatsSchema.parse(row);
}

type GetWotFollowsWhoFollowProps = {
  db: CoreDb;
  targetPubkey: string;
  rootPubkey: string;
};

export function getWotFollowsWhoFollow({
  db,
  targetPubkey,
  rootPubkey,
}: GetWotFollowsWhoFollowProps): string[] | null {
  const normalizedRootPubkey = rootPubkey.toLowerCase();

  if (!getWotRootStats(db, normalizedRootPubkey)) {
    return null;
  }

  const incomplete = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM wot_edges direct
      LEFT JOIN wot_nodes followed_node
        ON followed_node.root_pubkey = direct.root_pubkey
       AND followed_node.pubkey = direct.followed_pubkey
      WHERE direct.root_pubkey = ?
        AND direct.follower_pubkey = ?
        AND COALESCE(followed_node.follow_list_fetched_at, 0) = 0
    `,
    )
    .get(normalizedRootPubkey, normalizedRootPubkey) as { count: number };

  if (incomplete.count > 0) {
    return null;
  }

  const rows = db
    .prepare(
      `
      SELECT direct.followed_pubkey AS pubkey
      FROM wot_edges direct
      INNER JOIN wot_edges support
        ON support.root_pubkey = direct.root_pubkey
       AND support.follower_pubkey = direct.followed_pubkey
      WHERE direct.root_pubkey = ?
        AND direct.follower_pubkey = ?
        AND support.followed_pubkey = ?
      ORDER BY direct.followed_pubkey ASC
    `,
    )
    .all(
      normalizedRootPubkey,
      normalizedRootPubkey,
      targetPubkey.toLowerCase(),
    ) as Array<{ pubkey: string }>;

  return rows.map((row) => row.pubkey);
}
