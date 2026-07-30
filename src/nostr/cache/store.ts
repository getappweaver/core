import type { Event as NostrEvent } from 'nostr-tools';

import { uniqueRelays } from '../nip65';

import type { NostrCacheDb } from './db';
import { noteNostrCacheWrite } from './maintenance';
import { parseNostrEvent, parseVerifiedNostrEvent } from './schema';

export { getNostrCacheStats, type NostrCacheStats } from './maintenance';

export const MAX_CACHED_EVENT_SIZE_BYTES = 128 * 1024;
export const MAX_CACHED_RELAY_HINTS = 8;
export const MAX_AUTHOR_QUERY_LIMIT = 100;

export type CachedEvent = {
  event: NostrEvent;
  relayHints: string[];
  cachedAt: number;
  lastAccessedAt: number;
};

export type CachedReplaceableEvent = CachedEvent & {
  identifier: string;
  lastCheckedAt: number;
};

export type CachePutResult = {
  event: NostrEvent;
  persisted: boolean;
  replaced: boolean;
};

export type AuthorEventCursor = {
  createdAt: number;
  eventId: string;
};

export type QueryCachedAuthorEventsResult = {
  events: CachedEvent[];
  nextCursor: AuthorEventCursor | null;
};

type EventRow = {
  event_id: string;
  event_json: string;
  relay_hints_json: string;
  cached_at: number;
  last_accessed_at: number;
};

type ReplaceableEventRow = EventRow & {
  identifier: string;
  last_checked_at: number;
};

type PutCachedEventByIdProps = {
  db: NostrCacheDb;
  event: unknown;
  requestedEventId: string;
  relayHints: string[];
  nowMs: number;
};

type PutTrustedCachedEventByIdProps = Omit<PutCachedEventByIdProps, 'event'> & {
  event: NostrEvent;
};

type UpsertCachedReplaceableEventProps = {
  db: NostrCacheDb;
  event: unknown;
  kind: number;
  pubkey: string;
  identifier: string | null;
  relayHints: string[];
  nowMs: number;
  lastCheckedAt: number;
};

type UpsertTrustedCachedReplaceableEventProps = Omit<
  UpsertCachedReplaceableEventProps,
  'event'
> & {
  event: NostrEvent;
};

type QueryCachedAuthorEventsProps = {
  db: NostrCacheDb;
  pubkey: string;
  kind: number;
  limit: number;
  cursor: AuthorEventCursor | null;
  nowMs: number;
};

type TouchCachedEventByIdProps = {
  db: NostrCacheDb;
  eventId: string;
  nowMs: number;
};

type UpdateCachedEventAccessProps = TouchCachedEventByIdProps & {
  relayHints: string[];
};

type ReplaceableAddressProps = {
  db: NostrCacheDb;
  kind: number;
  pubkey: string;
  identifier: string | null;
};

type TouchCachedReplaceableEventProps = ReplaceableAddressProps & {
  nowMs: number;
};

type UpdateCachedReplaceableAccessProps = TouchCachedReplaceableEventProps & {
  relayHints: string[];
};

type MarkCachedReplaceableCheckedProps = ReplaceableAddressProps & {
  checkedAtMs: number;
};

function normalizeHex(value: string): string {
  return value.toLowerCase();
}

export function normalizeReplaceableIdentifier(
  identifier: string | null,
): string {
  return identifier ?? '';
}

export function isReplaceableKind(kind: number): boolean {
  return (
    kind === 0 ||
    kind === 3 ||
    (kind >= 10_000 && kind < 20_000) ||
    (kind >= 30_000 && kind < 40_000)
  );
}

export function isEphemeralKind(kind: number): boolean {
  return kind >= 20_000 && kind < 30_000;
}

function serializeEvent(event: NostrEvent): {
  eventJson: string;
  sizeBytes: number;
} {
  const eventJson = JSON.stringify(event);
  const sizeBytes = Buffer.byteLength(eventJson, 'utf8');

  if (sizeBytes > MAX_CACHED_EVENT_SIZE_BYTES) {
    throw new Error(`Nostr event exceeds ${MAX_CACHED_EVENT_SIZE_BYTES} bytes`);
  }

  return { eventJson, sizeBytes };
}

function parseRelayHints(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? uniqueRelays(
          parsed.filter((hint): hint is string => typeof hint === 'string'),
        ).slice(0, MAX_CACHED_RELAY_HINTS)
      : [];
  } catch {
    return [];
  }
}

function mergeRelayHints(existing: string[], incoming: string[]): string[] {
  return uniqueRelays([...existing, ...incoming]).slice(
    0,
    MAX_CACHED_RELAY_HINTS,
  );
}

function parseEventRow(row: EventRow): CachedEvent {
  return {
    event: parseNostrEvent(JSON.parse(row.event_json) as unknown),
    relayHints: parseRelayHints(row.relay_hints_json),
    cachedAt: row.cached_at,
    lastAccessedAt: row.last_accessed_at,
  };
}

export function getCachedEventById(
  db: NostrCacheDb,
  eventId: string,
): CachedEvent | null {
  const normalizedEventId = normalizeHex(eventId);

  const row = db
    .prepare(
      `SELECT event_id, event_json, relay_hints_json, cached_at, last_accessed_at
       FROM nostr_events WHERE event_id = ?`,
    )
    .get(normalizedEventId) as EventRow | null;

  if (!row) {
    return null;
  }

  try {
    const cached = parseEventRow(row);

    if (cached.event.id !== normalizedEventId) {
      throw new Error('Cached Nostr event ID does not match its key');
    }

    return cached;
  } catch {
    deleteCachedEventById(db, normalizedEventId);

    return null;
  }
}

function putTrustedCachedEventById({
  db,
  event,
  requestedEventId,
  relayHints,
  nowMs,
}: PutTrustedCachedEventByIdProps): CachePutResult {
  const normalizedRequestedId = normalizeHex(requestedEventId);

  if (event.id !== normalizedRequestedId) {
    throw new Error('Nostr event does not match the requested event ID');
  }

  if (isReplaceableKind(event.kind) || isEphemeralKind(event.kind)) {
    return { event, persisted: false, replaced: false };
  }

  const { eventJson, sizeBytes } = serializeEvent(event);
  const existing = getCachedEventById(db, event.id);

  const normalizedHints = mergeRelayHints(
    existing?.relayHints ?? [],
    relayHints,
  );

  db.run(
    `INSERT INTO nostr_events (
       event_id, event_json, pubkey, kind, created_at, relay_hints_json,
       size_bytes, cached_at, last_accessed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET
       relay_hints_json = excluded.relay_hints_json,
       last_accessed_at = excluded.last_accessed_at`,
    [
      event.id,
      eventJson,
      event.pubkey,
      event.kind,
      event.created_at,
      JSON.stringify(normalizedHints),
      sizeBytes,
      nowMs,
      nowMs,
    ],
  );

  noteNostrCacheWrite(db);

  return { event, persisted: true, replaced: existing === null };
}

export function putCachedEventById(
  props: PutCachedEventByIdProps,
): CachePutResult {
  return putTrustedCachedEventById({
    ...props,
    event: parseVerifiedNostrEvent(props.event),
  });
}

/** Write an event already verified by the receiving pool or trusted local DB. */
export { putTrustedCachedEventById };

export function touchCachedEventById({
  db,
  eventId,
  nowMs,
}: TouchCachedEventByIdProps): boolean {
  const result = db.run(
    'UPDATE nostr_events SET last_accessed_at = ? WHERE event_id = ?',
    [nowMs, normalizeHex(eventId)],
  );

  return result.changes > 0;
}

export function updateCachedEventAccess({
  db,
  eventId,
  relayHints,
  nowMs,
}: UpdateCachedEventAccessProps): boolean {
  const cached = getCachedEventById(db, eventId);

  if (!cached) {
    return false;
  }

  const mergedHints = mergeRelayHints(cached.relayHints, relayHints);

  const result = db.run(
    `UPDATE nostr_events
     SET relay_hints_json = ?, last_accessed_at = ?
     WHERE event_id = ?`,
    [JSON.stringify(mergedHints), nowMs, normalizeHex(eventId)],
  );

  return result.changes > 0;
}

export function deleteCachedEventById(
  db: NostrCacheDb,
  eventId: string,
): boolean {
  return (
    db.run('DELETE FROM nostr_events WHERE event_id = ?', [
      normalizeHex(eventId),
    ]).changes > 0
  );
}

export function getCachedReplaceableEvent({
  db,
  kind,
  pubkey,
  identifier,
}: ReplaceableAddressProps): CachedReplaceableEvent | null {
  const normalizedPubkey = normalizeHex(pubkey);
  const normalizedIdentifier = normalizeReplaceableIdentifier(identifier);

  const row = db
    .prepare(
      `SELECT event_id, event_json, relay_hints_json, cached_at,
              last_accessed_at, identifier, last_checked_at
       FROM nostr_replaceable_events
       WHERE kind = ? AND pubkey = ? AND identifier = ?`,
    )
    .get(
      kind,
      normalizedPubkey,
      normalizedIdentifier,
    ) as ReplaceableEventRow | null;

  if (!row) {
    return null;
  }

  try {
    const cached = parseEventRow(row);

    validateReplaceableAddress({
      event: cached.event,
      kind,
      pubkey: normalizedPubkey,
      identifier: normalizedIdentifier,
    });

    return {
      ...cached,
      identifier: row.identifier,
      lastCheckedAt: row.last_checked_at,
    };
  } catch {
    deleteCachedReplaceableEvent({
      db,
      kind,
      pubkey: normalizedPubkey,
      identifier: normalizedIdentifier,
    });

    return null;
  }
}

type ValidateReplaceableAddressProps = {
  event: NostrEvent;
  kind: number;
  pubkey: string;
  identifier: string;
};

function validateReplaceableAddress({
  event,
  kind,
  pubkey,
  identifier,
}: ValidateReplaceableAddressProps): void {
  if (
    !isReplaceableKind(kind) ||
    event.kind !== kind ||
    event.pubkey !== pubkey
  ) {
    throw new Error(
      'Nostr event does not match the requested replaceable address',
    );
  }

  const eventIdentifier =
    kind >= 30_000 && kind < 40_000
      ? (event.tags.find((tag) => tag[0] === 'd')?.[1] ?? '')
      : '';

  if (eventIdentifier !== identifier) {
    throw new Error(
      'Nostr event identifier does not match the requested address',
    );
  }
}

function upsertTrustedCachedReplaceableEvent({
  db,
  event,
  kind,
  pubkey,
  identifier,
  relayHints,
  nowMs,
  lastCheckedAt,
}: UpsertTrustedCachedReplaceableEventProps): CachePutResult {
  const normalizedPubkey = normalizeHex(pubkey);
  const normalizedIdentifier = normalizeReplaceableIdentifier(identifier);

  validateReplaceableAddress({
    event,
    kind,
    pubkey: normalizedPubkey,
    identifier: normalizedIdentifier,
  });

  const { eventJson, sizeBytes } = serializeEvent(event);

  const existing = getCachedReplaceableEvent({
    db,
    kind,
    pubkey: normalizedPubkey,
    identifier: normalizedIdentifier,
  });

  const normalizedHints = mergeRelayHints(
    existing?.relayHints ?? [],
    relayHints,
  );

  const shouldReplace =
    existing === null ||
    event.created_at > existing.event.created_at ||
    (event.created_at === existing.event.created_at &&
      event.id < existing.event.id);

  if (existing && !shouldReplace) {
    db.run(
      `UPDATE nostr_replaceable_events
       SET relay_hints_json = ?, last_accessed_at = ?, last_checked_at = MAX(last_checked_at, ?)
       WHERE kind = ? AND pubkey = ? AND identifier = ?`,
      [
        JSON.stringify(normalizedHints),
        nowMs,
        lastCheckedAt,
        kind,
        normalizedPubkey,
        normalizedIdentifier,
      ],
    );

    noteNostrCacheWrite(db);

    return { event, persisted: true, replaced: false };
  }

  db.run(
    `INSERT INTO nostr_replaceable_events (
       kind, pubkey, identifier, event_id, event_json, created_at,
       relay_hints_json, size_bytes, cached_at, last_accessed_at, last_checked_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, pubkey, identifier) DO UPDATE SET
       event_id = excluded.event_id,
       event_json = excluded.event_json,
       created_at = excluded.created_at,
       relay_hints_json = excluded.relay_hints_json,
       size_bytes = excluded.size_bytes,
       cached_at = excluded.cached_at,
       last_accessed_at = excluded.last_accessed_at,
       last_checked_at = excluded.last_checked_at`,
    [
      kind,
      normalizedPubkey,
      normalizedIdentifier,
      event.id,
      eventJson,
      event.created_at,
      JSON.stringify(normalizedHints),
      sizeBytes,
      nowMs,
      nowMs,
      lastCheckedAt,
    ],
  );

  noteNostrCacheWrite(db);

  return { event, persisted: true, replaced: true };
}

export function upsertCachedReplaceableEvent(
  props: UpsertCachedReplaceableEventProps,
): CachePutResult {
  return upsertTrustedCachedReplaceableEvent({
    ...props,
    event: parseVerifiedNostrEvent(props.event),
  });
}

/** Write an event already verified by the receiving pool or trusted local DB. */
export { upsertTrustedCachedReplaceableEvent };

export function touchCachedReplaceableEvent({
  db,
  kind,
  pubkey,
  identifier,
  nowMs,
}: TouchCachedReplaceableEventProps): boolean {
  const result = db.run(
    `UPDATE nostr_replaceable_events SET last_accessed_at = ?
     WHERE kind = ? AND pubkey = ? AND identifier = ?`,
    [
      nowMs,
      kind,
      normalizeHex(pubkey),
      normalizeReplaceableIdentifier(identifier),
    ],
  );

  return result.changes > 0;
}

export function updateCachedReplaceableAccess({
  db,
  kind,
  pubkey,
  identifier,
  relayHints,
  nowMs,
}: UpdateCachedReplaceableAccessProps): boolean {
  const cached = getCachedReplaceableEvent({ db, kind, pubkey, identifier });

  if (!cached) {
    return false;
  }

  const mergedHints = mergeRelayHints(cached.relayHints, relayHints);

  const result = db.run(
    `UPDATE nostr_replaceable_events
     SET relay_hints_json = ?, last_accessed_at = ?
     WHERE kind = ? AND pubkey = ? AND identifier = ?`,
    [
      JSON.stringify(mergedHints),
      nowMs,
      kind,
      normalizeHex(pubkey),
      normalizeReplaceableIdentifier(identifier),
    ],
  );

  return result.changes > 0;
}

export function markCachedReplaceableChecked({
  db,
  kind,
  pubkey,
  identifier,
  checkedAtMs,
}: MarkCachedReplaceableCheckedProps): boolean {
  const result = db.run(
    `UPDATE nostr_replaceable_events
     SET last_checked_at = MAX(last_checked_at, ?)
     WHERE kind = ? AND pubkey = ? AND identifier = ?`,
    [
      checkedAtMs,
      kind,
      normalizeHex(pubkey),
      normalizeReplaceableIdentifier(identifier),
    ],
  );

  return result.changes > 0;
}

export function deleteCachedReplaceableEvent({
  db,
  kind,
  pubkey,
  identifier,
}: ReplaceableAddressProps): boolean {
  return (
    db.run(
      `DELETE FROM nostr_replaceable_events
       WHERE kind = ? AND pubkey = ? AND identifier = ?`,
      [kind, normalizeHex(pubkey), normalizeReplaceableIdentifier(identifier)],
    ).changes > 0
  );
}

export function queryCachedAuthorEvents({
  db,
  pubkey,
  kind,
  limit,
  cursor,
  nowMs,
}: QueryCachedAuthorEventsProps): QueryCachedAuthorEventsResult {
  const boundedLimit = Math.max(
    1,
    Math.min(Math.trunc(limit), MAX_AUTHOR_QUERY_LIMIT),
  );

  const normalizedPubkey = normalizeHex(pubkey);

  const cursorClause = cursor
    ? 'AND (created_at < ? OR (created_at = ? AND event_id < ?))'
    : '';

  const cursorParams = cursor
    ? [cursor.createdAt, cursor.createdAt, normalizeHex(cursor.eventId)]
    : [];

  const rows = db
    .prepare(
      `SELECT event_id, event_json, relay_hints_json, cached_at, last_accessed_at
       FROM (
         SELECT event_id, event_json, relay_hints_json, cached_at,
                last_accessed_at, created_at
         FROM nostr_events
         WHERE pubkey = ? AND kind = ? ${cursorClause}
         UNION ALL
         SELECT event_id, event_json, relay_hints_json, cached_at,
                last_accessed_at, created_at
         FROM nostr_replaceable_events
         WHERE pubkey = ? AND kind = ? ${cursorClause}
       )
       ORDER BY created_at DESC, event_id DESC
       LIMIT ?`,
    )
    .all(
      normalizedPubkey,
      kind,
      ...cursorParams,
      normalizedPubkey,
      kind,
      ...cursorParams,
      boundedLimit + 1,
    ) as EventRow[];

  const uniqueRows = [
    ...new Map(rows.map((row) => [row.event_id, row])).values(),
  ];

  const pageRows = uniqueRows.slice(0, boundedLimit);

  const events = pageRows.flatMap((row) => {
    try {
      return [parseEventRow(row)];
    } catch {
      return [];
    }
  });

  if (events.length > 0) {
    const ids = events.map((cached) => cached.event.id);
    const placeholders = ids.map(() => '?').join(', ');

    db.run(
      `UPDATE nostr_events SET last_accessed_at = ? WHERE event_id IN (${placeholders})`,
      [nowMs, ...ids],
    );

    db.run(
      `UPDATE nostr_replaceable_events SET last_accessed_at = ? WHERE event_id IN (${placeholders})`,
      [nowMs, ...ids],
    );
  }

  const lastEvent = events.at(-1)?.event ?? null;

  return {
    events,
    nextCursor:
      uniqueRows.length > boundedLimit && lastEvent
        ? { createdAt: lastEvent.created_at, eventId: lastEvent.id }
        : null,
  };
}

export function clearNostrCache(db: NostrCacheDb): void {
  db.transaction(() => {
    db.run('DELETE FROM nostr_events');
    db.run('DELETE FROM nostr_replaceable_events');
  })();
}
