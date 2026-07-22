import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  finalizeEvent,
  generateSecretKey,
  type Event as NostrEvent,
} from 'nostr-tools';

import { createNostrCacheTables, type NostrCacheDb } from './db';
import { runNostrCacheMaintenance } from './maintenance';
import {
  getCachedEventById,
  getCachedReplaceableEvent,
  getNostrCacheStats,
  MAX_CACHED_RELAY_HINTS,
  putCachedEventById,
  queryCachedAuthorEvents,
  touchCachedEventById,
  upsertCachedReplaceableEvent,
} from './store';

type CreateEventProps = {
  kind: number;
  createdAt: number;
  content: string;
  tags: string[][];
  secretKey: Uint8Array;
};

function createEvent({
  kind,
  createdAt,
  content,
  tags,
  secretKey,
}: CreateEventProps): NostrEvent {
  return finalizeEvent(
    { kind, created_at: createdAt, content, tags },
    secretKey,
  );
}

function putRegular(db: NostrCacheDb, event: NostrEvent, nowMs: number): void {
  putCachedEventById({
    db,
    event,
    requestedEventId: event.id,
    relayHints: [],
    nowMs,
  });
}

describe('Nostr cache store', () => {
  let db: NostrCacheDb;
  let secretKey: Uint8Array;

  beforeEach(() => {
    db = new Database(':memory:') as NostrCacheDb;
    createNostrCacheTables(db);
    secretKey = generateSecretKey();
  });

  afterEach(() => {
    db.close();
  });

  test('inserts and retrieves a valid immutable event', () => {
    const event = createEvent({
      kind: 1,
      createdAt: 100,
      content: 'cached',
      tags: [],
      secretKey,
    });

    const result = putCachedEventById({
      db,
      event,
      requestedEventId: event.id.toUpperCase(),
      relayHints: ['relay.example'],
      nowMs: 1_000,
    });

    expect(result.persisted).toBe(true);

    expect(getCachedEventById(db, event.id)).toEqual({
      event,
      relayHints: ['wss://relay.example/'],
      cachedAt: 1_000,
      lastAccessedAt: 1_000,
    });
  });

  test('rejects invalid IDs, signatures, and requested IDs', () => {
    const event = createEvent({
      kind: 1,
      createdAt: 100,
      content: 'valid',
      tags: [],
      secretKey,
    });

    const wrongIdEvent = { ...event, id: '0'.repeat(64) };
    const wrongSignatureEvent = { ...event, sig: '0'.repeat(128) };

    expect(() =>
      putCachedEventById({
        db,
        event: wrongIdEvent,
        requestedEventId: wrongIdEvent.id,
        relayHints: [],
        nowMs: 1,
      }),
    ).toThrow();

    expect(() =>
      putCachedEventById({
        db,
        event: wrongSignatureEvent,
        requestedEventId: event.id,
        relayHints: [],
        nowMs: 1,
      }),
    ).toThrow();

    expect(() =>
      putCachedEventById({
        db,
        event,
        requestedEventId: 'f'.repeat(64),
        relayHints: [],
        nowMs: 1,
      }),
    ).toThrow('requested event ID');

    expect(getNostrCacheStats(db).combined.rows).toBe(0);
  });

  test('rejects oversized events without caching them', () => {
    const event = createEvent({
      kind: 1,
      createdAt: 100,
      content: 'x'.repeat(128 * 1024),
      tags: [],
      secretKey,
    });

    expect(() =>
      putCachedEventById({
        db,
        event,
        requestedEventId: event.id,
        relayHints: [],
        nowMs: 1,
      }),
    ).toThrow('exceeds');

    expect(getNostrCacheStats(db).combined.rows).toBe(0);
  });

  test('touch changes access time without rewriting event JSON', () => {
    const event = createEvent({
      kind: 1,
      createdAt: 100,
      content: 'touch',
      tags: [],
      secretKey,
    });

    putRegular(db, event, 10);

    const before = db
      .prepare(
        'SELECT event_json, cached_at, last_accessed_at FROM nostr_events WHERE event_id = ?',
      )
      .get(event.id) as {
      event_json: string;
      cached_at: number;
      last_accessed_at: number;
    };

    expect(touchCachedEventById({ db, eventId: event.id, nowMs: 20 })).toBe(
      true,
    );

    const after = db
      .prepare(
        'SELECT event_json, cached_at, last_accessed_at FROM nostr_events WHERE event_id = ?',
      )
      .get(event.id) as typeof before;

    expect(after.event_json).toBe(before.event_json);
    expect(after.cached_at).toBe(before.cached_at);
    expect(after.last_accessed_at).toBe(20);
  });

  test('normalizes, merges, deduplicates, and caps relay hints', () => {
    const event = createEvent({
      kind: 1,
      createdAt: 100,
      content: 'relays',
      tags: [],
      secretKey,
    });

    putCachedEventById({
      db,
      event,
      requestedEventId: event.id,
      relayHints: [
        'one.example',
        'wss://two.example',
        'not a relay',
        'three.example',
        'four.example',
        'five.example',
      ],
      nowMs: 1,
    });

    putCachedEventById({
      db,
      event,
      requestedEventId: event.id,
      relayHints: [
        'WSS://TWO.EXAMPLE',
        'six.example',
        'seven.example',
        'eight.example',
        'nine.example',
        'ten.example',
      ],
      nowMs: 2,
    });

    const hints = getCachedEventById(db, event.id)?.relayHints ?? [];

    expect(hints).toHaveLength(MAX_CACHED_RELAY_HINTS);
    expect(new Set(hints).size).toBe(MAX_CACHED_RELAY_HINTS);
    expect(hints[0]).toBe('wss://one.example/');
    expect(hints).toContain('wss://two.example/');
  });

  test('reports per-table and combined cache statistics', () => {
    const regular = createEvent({
      kind: 1,
      createdAt: 100,
      content: 'regular',
      tags: [],
      secretKey,
    });

    const replaceable = createEvent({
      kind: 0,
      createdAt: 101,
      content: '{}',
      tags: [],
      secretKey,
    });

    putRegular(db, regular, 1);

    upsertCachedReplaceableEvent({
      db,
      event: replaceable,
      kind: 0,
      pubkey: replaceable.pubkey,
      identifier: null,
      relayHints: [],
      nowMs: 2,
      lastCheckedAt: 2,
    });

    const stats = getNostrCacheStats(db);

    expect(stats.regular.rows).toBe(1);
    expect(stats.replaceable.rows).toBe(1);
    expect(stats.combined.rows).toBe(2);

    expect(stats.combined.bytes).toBe(
      stats.regular.bytes + stats.replaceable.bytes,
    );
  });

  test('routes replaceable and ephemeral kinds away from immutable storage', () => {
    const replaceable = createEvent({
      kind: 10_002,
      createdAt: 100,
      content: '',
      tags: [],
      secretKey,
    });

    const ephemeral = createEvent({
      kind: 20_001,
      createdAt: 101,
      content: '',
      tags: [],
      secretKey,
    });

    const replaceableResult = putCachedEventById({
      db,
      event: replaceable,
      requestedEventId: replaceable.id,
      relayHints: [],
      nowMs: 1,
    });

    const ephemeralResult = putCachedEventById({
      db,
      event: ephemeral,
      requestedEventId: ephemeral.id,
      relayHints: [],
      nowMs: 2,
    });

    expect(replaceableResult.persisted).toBe(false);
    expect(ephemeralResult.persisted).toBe(false);
    expect(getNostrCacheStats(db).combined.rows).toBe(0);

    upsertCachedReplaceableEvent({
      db,
      event: replaceable,
      kind: replaceable.kind,
      pubkey: replaceable.pubkey,
      identifier: null,
      relayHints: [],
      nowMs: 3,
      lastCheckedAt: 3,
    });

    expect(getNostrCacheStats(db).regular.rows).toBe(0);
    expect(getNostrCacheStats(db).replaceable.rows).toBe(1);
  });

  test('keeps the newest replaceable event with deterministic ID tie-breaking', () => {
    const events = [
      createEvent({
        kind: 0,
        createdAt: 100,
        content: '{"name":"a"}',
        tags: [],
        secretKey,
      }),
      createEvent({
        kind: 0,
        createdAt: 100,
        content: '{"name":"b"}',
        tags: [],
        secretKey,
      }),
    ].sort((left, right) => left.id.localeCompare(right.id));

    const older = createEvent({
      kind: 0,
      createdAt: 99,
      content: '{"name":"older"}',
      tags: [],
      secretKey,
    });

    for (const event of [events[0], older, events[1], events[0]]) {
      upsertCachedReplaceableEvent({
        db,
        event,
        kind: 0,
        pubkey: event.pubkey,
        identifier: null,
        relayHints: [],
        nowMs: event.created_at,
        lastCheckedAt: event.created_at,
      });
    }

    expect(
      getCachedReplaceableEvent({
        db,
        kind: 0,
        pubkey: events[1].pubkey,
        identifier: null,
      })?.event.id,
    ).toBe(events[0].id);
  });

  test('rejects replaceable events for a different address', () => {
    const event = createEvent({
      kind: 30_023,
      createdAt: 100,
      content: 'article',
      tags: [['d', 'correct-id']],
      secretKey,
    });

    expect(() =>
      upsertCachedReplaceableEvent({
        db,
        event,
        kind: event.kind,
        pubkey: event.pubkey,
        identifier: 'wrong-id',
        relayHints: [],
        nowMs: 1,
        lastCheckedAt: 1,
      }),
    ).toThrow('identifier');

    expect(() =>
      upsertCachedReplaceableEvent({
        db,
        event,
        kind: event.kind,
        pubkey: '0'.repeat(64),
        identifier: 'correct-id',
        relayHints: [],
        nowMs: 1,
        lastCheckedAt: 1,
      }),
    ).toThrow('replaceable address');

    expect(getNostrCacheStats(db).combined.rows).toBe(0);
  });

  test('normalizes missing identifiers to one replaceable address', () => {
    const first = createEvent({
      kind: 0,
      createdAt: 100,
      content: 'first',
      tags: [],
      secretKey,
    });

    const second = createEvent({
      kind: 0,
      createdAt: 101,
      content: 'second',
      tags: [],
      secretKey,
    });

    upsertCachedReplaceableEvent({
      db,
      event: first,
      kind: 0,
      pubkey: first.pubkey,
      identifier: null,
      relayHints: [],
      nowMs: 1,
      lastCheckedAt: 1,
    });

    upsertCachedReplaceableEvent({
      db,
      event: second,
      kind: 0,
      pubkey: second.pubkey,
      identifier: '',
      relayHints: [],
      nowMs: 2,
      lastCheckedAt: 2,
    });

    expect(getNostrCacheStats(db).replaceable.rows).toBe(1);

    expect(
      getCachedReplaceableEvent({
        db,
        kind: 0,
        pubkey: second.pubkey,
        identifier: null,
      })?.event.id,
    ).toBe(second.id);
  });

  test('queries author events in indexed, stable pages', () => {
    const events = [100, 102, 101, 102].map((createdAt, index) =>
      createEvent({
        kind: 1,
        createdAt,
        content: `post-${index}`,
        tags: [],
        secretKey,
      }),
    );

    for (const event of events) {
      putRegular(db, event, 1);
    }

    const firstPage = queryCachedAuthorEvents({
      db,
      pubkey: events[0].pubkey,
      kind: 1,
      limit: 2,
      cursor: null,
      nowMs: 10,
    });

    const secondPage = queryCachedAuthorEvents({
      db,
      pubkey: events[0].pubkey,
      kind: 1,
      limit: 2,
      cursor: firstPage.nextCursor,
      nowMs: 11,
    });

    const allIds = [...firstPage.events, ...secondPage.events].map(
      (cached) => cached.event.id,
    );

    const indexes = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index' AND name LIKE 'idx_nostr_%_author_kind_created'`,
      )
      .all() as Array<{ name: string }>;

    expect(firstPage.events).toHaveLength(2);
    expect(secondPage.events).toHaveLength(2);
    expect(new Set(allIds).size).toBe(4);
    expect(firstPage.events[0].event.created_at).toBe(102);

    expect(indexes.map((row) => row.name).sort()).toEqual([
      'idx_nostr_events_author_kind_created',
      'idx_nostr_replaceable_author_kind_created',
    ]);
  });

  test('prunes globally least-recently-used rows across both tables', () => {
    const oldRegular = createEvent({
      kind: 1,
      createdAt: 100,
      content: 'old regular',
      tags: [],
      secretKey,
    });

    const middleReplaceable = createEvent({
      kind: 0,
      createdAt: 101,
      content: 'middle replaceable',
      tags: [],
      secretKey,
    });

    const recentRegular = createEvent({
      kind: 1,
      createdAt: 102,
      content: 'recent regular',
      tags: [],
      secretKey,
    });

    putRegular(db, oldRegular, 10);

    upsertCachedReplaceableEvent({
      db,
      event: middleReplaceable,
      kind: 0,
      pubkey: middleReplaceable.pubkey,
      identifier: null,
      relayHints: [],
      nowMs: 20,
      lastCheckedAt: 20,
    });

    putRegular(db, recentRegular, 30);

    const result = runNostrCacheMaintenance({
      db,
      limits: { maxBytes: 1_000_000, maxEvents: 2, pruneRatio: 0.5 },
    });

    expect(result.evictedRows).toBe(2);
    expect(result.after.combined.rows).toBe(1);
    expect(getCachedEventById(db, oldRegular.id)).toBeNull();

    expect(
      getCachedReplaceableEvent({
        db,
        kind: 0,
        pubkey: middleReplaceable.pubkey,
        identifier: null,
      }),
    ).toBeNull();

    expect(getCachedEventById(db, recentRegular.id)?.event.id).toBe(
      recentRegular.id,
    );
  });
});
