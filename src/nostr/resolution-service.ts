import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { SimplePool, SubscribeManyParams } from 'nostr-tools/pool';

import type { NostrCacheDb } from './cache/db';
import { closeNostrCacheDb } from './cache/db';
import { parseVerifiedNostrEvent } from './cache/schema';
import {
  getCachedReplaceableEvent,
  isEphemeralKind,
  isReplaceableKind,
  markCachedReplaceableChecked,
  putCachedEventById,
  queryCachedAuthorEvents,
  touchCachedReplaceableEvent,
  upsertCachedReplaceableEvent,
} from './cache/store';
import { createEventGraphResolver } from './event-graph';
import { parseEventReferences } from './event-references';
import type {
  GetCachedReplaceableEventsProps,
  QueryAuthorEventsProps,
  QueryDirectRepliesProps,
  RefreshReplaceableEventsBatchProps,
  ResolvedAuthorRelaySet,
  ResolvedEvent,
  ResolvedEventGraph,
  ResolvedReplaceableEvent,
  ResolveEventByIdProps,
  ResolveEventGraphProps,
  ResolveReplaceableEventProps,
  ResolveAuthorRelaySetProps,
  SeedEventInput,
  SeedEventResult,
  SeedEventsProps,
  SeedEventsResult,
} from './event-resolution-types';
import {
  DEFAULT_REPLACEABLE_RETRY_INTERVAL_MS,
  createEventResolver,
  createPoolEventResolutionNetwork,
  createSqliteEventResolutionCache,
} from './event-resolver';
import { uniqueRelays } from './nip65';
import {
  DEFAULT_NIP65_REFRESH_INTERVAL_MS,
  DEFAULT_NIP65_RETRY_INTERVAL_MS,
  MAX_RESOLVED_RELAYS,
  createRelayResolver,
} from './relay-resolver';

export const MAX_AUTHOR_EVENT_QUERY_LIMIT = 100;
export const MAX_DIRECT_REPLY_QUERY_LIMIT = 20;
export const MAX_BATCH_REPLACEABLE_AUTHORS = 1_000;
export const BATCH_REPLACEABLE_AUTHOR_CHUNK_SIZE = 50;
export const MAX_SEED_EVENTS = 100;
export const RESOLUTION_SHUTDOWN_TIMEOUT_MS = 1_000;

export type NostrResolutionService = {
  resolveEventById: (props: ResolveEventByIdProps) => Promise<ResolvedEvent>;
  resolveReplaceableEvent: (
    props: ResolveReplaceableEventProps,
  ) => Promise<ResolvedReplaceableEvent>;
  resolveGraph: (props: ResolveEventGraphProps) => Promise<ResolvedEventGraph>;
  queryAuthorEvents: (props: QueryAuthorEventsProps) => Promise<NostrEvent[]>;
  queryDirectReplies: (props: QueryDirectRepliesProps) => Promise<NostrEvent[]>;
  resolveAuthorRelaySet: (
    props: ResolveAuthorRelaySetProps,
  ) => Promise<ResolvedAuthorRelaySet>;
  getCachedReplaceableEvents: (
    props: GetCachedReplaceableEventsProps,
  ) => Promise<NostrEvent[]>;
  refreshReplaceableEventsBatch: (
    props: RefreshReplaceableEventsBatchProps,
  ) => Promise<NostrEvent[]>;
  seedEvents: (props: SeedEventsProps) => Promise<SeedEventsResult>;
};

export type NostrResolutionRuntime = {
  service: NostrResolutionService;
  shutdown: () => Promise<void>;
};

type ResolutionServicePool = Pick<SimplePool, 'subscribeMany'>;

type CreateNostrResolutionServiceProps = {
  db: NostrCacheDb;
  pool: ResolutionServicePool;
  nowMs: () => number;
  filterReadRelays: (relays: string[]) => string[];
  profileRelays: readonly string[];
  closeDbOnShutdown: boolean;
};

type AuthorRefreshResult = {
  events: NostrEvent[];
  completed: boolean;
};

type RefreshAuthorEventsProps = {
  pubkey: string;
  kind: number;
  relayHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  limit: number;
  deadlineAtMs: number;
};

type StartAuthorRefreshProps = {
  props: RefreshAuthorEventsProps;
  refreshKey: string;
  freshnessKey: string;
};

type SeedOneProps = {
  entry: SeedEventInput;
  nowMs: number;
};

function isHex64(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function authorEventsFilter({
  pubkey,
  kind,
  limit,
}: Pick<QueryAuthorEventsProps, 'pubkey' | 'kind' | 'limit'>): Filter {
  return { authors: [pubkey], kinds: [kind], limit };
}

function sortedUniqueEvents(events: NostrEvent[], limit: number): NostrEvent[] {
  return [...new Map(events.map((event) => [event.id, event])).values()]
    .sort(
      (left, right) =>
        right.created_at - left.created_at || right.id.localeCompare(left.id),
    )
    .slice(0, limit);
}

function newestByAuthor(events: NostrEvent[]): Map<string, NostrEvent> {
  const newest = new Map<string, NostrEvent>();

  for (const event of events) {
    const current = newest.get(event.pubkey);

    if (
      !current ||
      event.created_at > current.created_at ||
      (event.created_at === current.created_at && event.id < current.id)
    ) {
      newest.set(event.pubkey, event);
    }
  }

  return newest;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function combineAbortSignals(
  operationSignal: AbortSignal | undefined,
  serviceSignal: AbortSignal,
): AbortSignal {
  return operationSignal
    ? AbortSignal.any([operationSignal, serviceSignal])
    : serviceSignal;
}

export function createNostrResolutionService({
  db,
  pool,
  nowMs,
  filterReadRelays,
  profileRelays,
  closeDbOnShutdown,
}: CreateNostrResolutionServiceProps): NostrResolutionRuntime {
  const abortController = new AbortController();
  const activeOperations = new Set<Promise<unknown>>();
  const authorRefreshes = new Map<string, Promise<AuthorRefreshResult>>();
  const authorLastCheckedAt = new Map<string, number>();
  let shutdownPromise: Promise<void> | null = null;
  let shuttingDown = false;

  const abortablePool: ResolutionServicePool = {
    subscribeMany: (relays, filter, params: SubscribeManyParams) =>
      pool.subscribeMany(relays, filter, {
        ...params,
        abort: combineAbortSignals(params.abort, abortController.signal),
      }),
  };

  const relayResolver = createRelayResolver({
    db,
    pool: abortablePool,
    nowMs,
    filterReadRelays,
    profileRelays,
    nip65RefreshIntervalMs: DEFAULT_NIP65_REFRESH_INTERVAL_MS,
    nip65RetryIntervalMs: DEFAULT_NIP65_RETRY_INTERVAL_MS,
  });

  const network = createPoolEventResolutionNetwork({
    pool: abortablePool,
    nowMs,
    countNewer: null,
  });

  function track<T>(operation: Promise<T>): Promise<T> {
    activeOperations.add(operation);

    void operation.then(
      () => activeOperations.delete(operation),
      () => activeOperations.delete(operation),
    );

    return operation;
  }

  function assertAvailable(): void {
    if (shuttingDown) {
      throw new Error('nostr_resolution_unavailable');
    }
  }

  const eventResolver = createEventResolver({
    cache: createSqliteEventResolutionCache(db),
    relayResolver,
    network,
    nowMs,
    runInBackground: (task) => {
      void track(task).catch(() => undefined);
    },
    refreshRetryIntervalMs: DEFAULT_REPLACEABLE_RETRY_INTERVAL_MS,
  });

  const graphResolver = createEventGraphResolver({ eventResolver, nowMs });

  function seedOne({
    entry,
    nowMs: currentTime,
  }: SeedOneProps): SeedEventResult {
    try {
      const event = parseVerifiedNostrEvent(entry.event);
      const relayHints = uniqueRelays(entry.relayHints);

      if (isEphemeralKind(event.kind)) {
        return { eventId: event.id, status: 'skipped' };
      }

      if (isReplaceableKind(event.kind)) {
        const identifier =
          event.kind >= 30_000 && event.kind < 40_000
            ? (event.tags.find((tag) => tag[0] === 'd')?.[1] ?? '')
            : null;

        upsertCachedReplaceableEvent({
          db,
          event,
          kind: event.kind,
          pubkey: event.pubkey,
          identifier,
          relayHints,
          nowMs: currentTime,
          lastCheckedAt: entry.lastCheckedAtMs ?? 0,
        });
      } else {
        putCachedEventById({
          db,
          event,
          requestedEventId: event.id,
          relayHints,
          nowMs: currentTime,
        });
      }

      return { eventId: event.id, status: 'seeded' };
    } catch {
      return { eventId: null, status: 'invalid' };
    }
  }

  async function refreshAuthorEvents({
    pubkey,
    kind,
    relayHints,
    contextRelays,
    fallbackRelays,
    limit,
    deadlineAtMs,
  }: RefreshAuthorEventsProps): Promise<AuthorRefreshResult> {
    const relayResult = await relayResolver.resolveEventRelays({
      eventId: null,
      replaceableAddress: null,
      authorPubkey: pubkey,
      explicitHints: relayHints,
      contextRelays,
      fallbackRelays,
      deadlineAtMs,
    });

    const events: NostrEvent[] = [];
    let remainingRelayAttempts = MAX_RESOLVED_RELAYS;
    let completed = relayResult.groups.length > 0;

    for (const group of relayResult.groups) {
      if (deadlineAtMs <= nowMs() || remainingRelayAttempts <= 0) {
        completed = false;
        break;
      }

      const relays = group.relays
        .map((relay) => relay.url)
        .slice(0, remainingRelayAttempts);

      if (relays.length < group.relays.length) {
        completed = false;
      }

      remainingRelayAttempts -= relays.length;

      const result = await network.queryUntilEose({
        relays,
        filter: authorEventsFilter({ pubkey, kind, limit }),
        deadlineAtMs,
      });

      if (result.completion !== 'eose') {
        completed = false;
      }

      for (const input of result.events) {
        try {
          const event = parseVerifiedNostrEvent(input);

          if (event.pubkey !== pubkey || event.kind !== kind) {
            continue;
          }

          const seeded = seedOne({
            entry: { event, relayHints: relays, lastCheckedAtMs: nowMs() },
            nowMs: nowMs(),
          });

          if (seeded.status === 'invalid') {
            continue;
          }

          events.push(event);
        } catch {
          continue;
        }
      }
    }

    return { events: sortedUniqueEvents(events, limit), completed };
  }

  function startAuthorRefresh({
    props,
    refreshKey,
    freshnessKey,
  }: StartAuthorRefreshProps): Promise<AuthorRefreshResult> {
    const existing = authorRefreshes.get(refreshKey);

    if (existing) {
      return existing;
    }

    const pending = refreshAuthorEvents(props).then((result) => {
      if (result.completed) {
        authorLastCheckedAt.set(freshnessKey, nowMs());
      }

      return result;
    });

    authorRefreshes.set(refreshKey, pending);

    void pending.then(
      () => {
        if (authorRefreshes.get(refreshKey) === pending) {
          authorRefreshes.delete(refreshKey);
        }
      },
      () => {
        if (authorRefreshes.get(refreshKey) === pending) {
          authorRefreshes.delete(refreshKey);
        }
      },
    );

    return pending;
  }

  async function queryAuthorEvents({
    pubkey: inputPubkey,
    kind,
    relayHints,
    contextRelays,
    fallbackRelays,
    limit: inputLimit,
    refreshMode,
    refreshIntervalMs,
    deadlineAtMs,
  }: QueryAuthorEventsProps): Promise<NostrEvent[]> {
    const pubkey = inputPubkey.toLowerCase();

    if (
      !isHex64(pubkey) ||
      !Number.isSafeInteger(kind) ||
      kind < 0 ||
      !Number.isSafeInteger(inputLimit) ||
      inputLimit < 1 ||
      !Number.isFinite(refreshIntervalMs) ||
      refreshIntervalMs < 0
    ) {
      throw new Error('invalid_author_event_query');
    }

    const limit = Math.min(inputLimit, MAX_AUTHOR_EVENT_QUERY_LIMIT);

    const cached = queryCachedAuthorEvents({
      db,
      pubkey,
      kind,
      limit,
      cursor: null,
      nowMs: nowMs(),
    }).events.map((entry) => entry.event);

    const relayScope = uniqueRelays([
      ...relayHints,
      ...contextRelays,
      ...fallbackRelays,
    ]).sort();

    const freshnessKey = `${pubkey}:${kind}:${limit}:${relayScope.join(',')}`;
    const refreshKey = `${freshnessKey}:${deadlineAtMs}`;
    const lastCheckedAt = authorLastCheckedAt.get(freshnessKey);

    const refreshDue =
      lastCheckedAt === undefined ||
      nowMs() - lastCheckedAt >= refreshIntervalMs;

    if (cached.length > 0 && !refreshDue) {
      return cached;
    }

    const refresh = startAuthorRefresh({
      props: {
        pubkey,
        kind,
        relayHints: uniqueRelays(relayHints),
        contextRelays,
        fallbackRelays,
        limit,
        deadlineAtMs,
      },
      refreshKey,
      freshnessKey,
    });

    if (cached.length > 0 && refreshMode === 'stale-while-revalidate') {
      void track(refresh).catch(() => undefined);

      return cached;
    }

    const refreshed = await refresh;

    return sortedUniqueEvents([...cached, ...refreshed.events], limit);
  }

  async function queryDirectReplies({
    eventId,
    address,
    authorPubkey,
    relayHints,
    contextRelays,
    fallbackRelays,
    limit: inputLimit,
    deadlineAtMs,
  }: QueryDirectRepliesProps): Promise<NostrEvent[]> {
    if (
      !isHex64(eventId) ||
      !isHex64(authorPubkey) ||
      !Number.isSafeInteger(inputLimit) ||
      inputLimit < 1
    ) {
      throw new Error('invalid_direct_reply_query');
    }

    const limit = Math.min(inputLimit, MAX_DIRECT_REPLY_QUERY_LIMIT);

    const relaySet = await relayResolver.resolveAuthorRelaySet({
      pubkey: authorPubkey,
      explicitHints: relayHints,
      contextRelays,
      fallbackRelays,
      deadlineAtMs,
    });

    const relays = uniqueRelays([
      ...relayHints,
      ...relaySet.readRelays,
      ...contextRelays,
      ...fallbackRelays,
    ]);

    const filters: Filter[] = [
      { kinds: [1, 1111], '#e': [eventId], limit },
      ...(address ? [{ kinds: [1111], '#a': [address], limit }] : []),
    ];

    const candidates: NostrEvent[] = [];

    for (const filter of filters) {
      if (deadlineAtMs <= nowMs()) {
        break;
      }

      const result = await network.queryUntilEose({
        relays,
        filter,
        deadlineAtMs,
      });

      for (const input of result.events) {
        try {
          const event = parseVerifiedNostrEvent(input);

          const isDirect = parseEventReferences(event).some((edge) => {
            if (edge.role !== 'thread-parent') {
              return false;
            }

            return edge.target.type === 'event'
              ? edge.target.eventId === eventId
              : address !== null &&
                  `${edge.target.kind}:${edge.target.pubkey}:${edge.target.identifier}` ===
                    address;
          });

          if (!isDirect) {
            continue;
          }

          const seeded = seedOne({
            entry: { event, relayHints: relays, lastCheckedAtMs: null },
            nowMs: nowMs(),
          });

          if (seeded.status !== 'invalid') {
            candidates.push(event);
          }
        } catch {
          continue;
        }
      }

      if (result.completion !== 'eose') {
        break;
      }
    }

    return [...new Map(candidates.map((event) => [event.id, event])).values()]
      .sort(
        (left, right) =>
          left.created_at - right.created_at || left.id.localeCompare(right.id),
      )
      .slice(0, limit);
  }

  async function resolveAuthorRelaySet({
    pubkey,
    relayHints,
    contextRelays,
    fallbackRelays,
    deadlineAtMs,
  }: ResolveAuthorRelaySetProps): Promise<ResolvedAuthorRelaySet> {
    if (!isHex64(pubkey)) {
      throw new Error('invalid_author_relay_set_query');
    }

    const result = await relayResolver.resolveAuthorRelaySet({
      pubkey: pubkey.toLowerCase(),
      explicitHints: relayHints,
      contextRelays,
      fallbackRelays,
      deadlineAtMs,
    });

    return {
      readRelays: result.readRelays,
      writeRelays: result.writeRelays,
    };
  }

  async function getCachedReplaceableEvents({
    kind,
    pubkeys: inputPubkeys,
    identifier,
  }: GetCachedReplaceableEventsProps): Promise<NostrEvent[]> {
    const pubkeys = [
      ...new Set(inputPubkeys.map((pubkey) => pubkey.toLowerCase())),
    ];

    if (
      !isReplaceableKind(kind) ||
      pubkeys.length > MAX_BATCH_REPLACEABLE_AUTHORS ||
      pubkeys.some((pubkey) => !isHex64(pubkey))
    ) {
      throw new Error('invalid_replaceable_event_batch');
    }

    const currentTime = nowMs();

    return pubkeys.flatMap((pubkey) => {
      const cached = getCachedReplaceableEvent({
        db,
        kind,
        pubkey,
        identifier,
      });

      if (!cached) {
        return [];
      }

      touchCachedReplaceableEvent({
        db,
        kind,
        pubkey,
        identifier,
        nowMs: currentTime,
      });

      return [cached.event];
    });
  }

  async function refreshReplaceableEventsBatch({
    kind,
    pubkeys: inputPubkeys,
    identifier,
    contextRelays,
    fallbackRelays,
    refreshIntervalMs,
    deadlineAtMs,
  }: RefreshReplaceableEventsBatchProps): Promise<NostrEvent[]> {
    const pubkeys = [
      ...new Set(inputPubkeys.map((pubkey) => pubkey.toLowerCase())),
    ];

    if (
      !isReplaceableKind(kind) ||
      pubkeys.length > MAX_BATCH_REPLACEABLE_AUTHORS ||
      pubkeys.some((pubkey) => !isHex64(pubkey)) ||
      !Number.isFinite(refreshIntervalMs) ||
      refreshIntervalMs < 0
    ) {
      throw new Error('invalid_replaceable_event_batch');
    }

    const currentTime = nowMs();

    const duePubkeys = pubkeys.filter((pubkey) => {
      const cached = getCachedReplaceableEvent({
        db,
        kind,
        pubkey,
        identifier,
      });

      return (
        cached === null ||
        currentTime - cached.lastCheckedAt >= refreshIntervalMs
      );
    });

    const relays = filterReadRelays(
      uniqueRelays([...contextRelays, ...profileRelays, ...fallbackRelays]),
    ).slice(0, MAX_RESOLVED_RELAYS);

    for (const authorChunk of chunk(
      duePubkeys,
      BATCH_REPLACEABLE_AUTHOR_CHUNK_SIZE,
    )) {
      if (deadlineAtMs <= nowMs() || relays.length === 0) {
        break;
      }

      const result = await network.queryUntilEose({
        relays,
        filter: {
          kinds: [kind],
          authors: authorChunk,
          ...(kind >= 30_000 && kind < 40_000
            ? { '#d': [identifier ?? ''] }
            : {}),
          limit: authorChunk.length * 2,
        },
        deadlineAtMs,
      });

      const authorSet = new Set(authorChunk);

      const verified = result.events.flatMap((input) => {
        try {
          const event = parseVerifiedNostrEvent(input);

          const eventIdentifier =
            event.kind >= 30_000 && event.kind < 40_000
              ? (event.tags.find((tag) => tag[0] === 'd')?.[1] ?? '')
              : '';

          return event.kind === kind &&
            authorSet.has(event.pubkey) &&
            eventIdentifier === (identifier ?? '')
            ? [event]
            : [];
        } catch {
          return [];
        }
      });

      const checkedAtMs = nowMs();
      const newest = newestByAuthor(verified);

      for (const pubkey of authorChunk) {
        const event = newest.get(pubkey);

        if (event) {
          upsertCachedReplaceableEvent({
            db,
            event,
            kind,
            pubkey,
            identifier,
            relayHints: relays,
            nowMs: checkedAtMs,
            lastCheckedAt: result.completion === 'eose' ? checkedAtMs : 0,
          });
        } else if (result.completion === 'eose') {
          markCachedReplaceableChecked({
            db,
            kind,
            pubkey,
            identifier,
            checkedAtMs,
          });
        }
      }

      if (result.completion !== 'eose') {
        break;
      }
    }

    return getCachedReplaceableEvents({ kind, pubkeys, identifier });
  }

  async function seedEvents({
    entries,
  }: SeedEventsProps): Promise<SeedEventsResult> {
    if (entries.length > MAX_SEED_EVENTS) {
      throw new Error('seed_batch_too_large');
    }

    const currentTime = nowMs();

    const results = entries.map((entry) =>
      seedOne({ entry, nowMs: currentTime }),
    );

    return {
      seeded: results.filter((result) => result.status === 'seeded').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      invalid: results.filter((result) => result.status === 'invalid').length,
      results,
    };
  }

  const service: NostrResolutionService = {
    resolveEventById: (props) => {
      assertAvailable();

      return track(eventResolver.resolveEventById(props));
    },
    resolveReplaceableEvent: (props) => {
      assertAvailable();

      return track(eventResolver.resolveReplaceableEvent(props));
    },
    resolveGraph: (props) => {
      assertAvailable();

      return track(graphResolver.resolveGraph(props));
    },
    queryAuthorEvents: (props) => {
      assertAvailable();

      return track(queryAuthorEvents(props));
    },
    queryDirectReplies: (props) => {
      assertAvailable();

      return track(queryDirectReplies(props));
    },
    resolveAuthorRelaySet: (props) => {
      assertAvailable();

      return track(resolveAuthorRelaySet(props));
    },
    getCachedReplaceableEvents: (props) => {
      assertAvailable();

      return track(getCachedReplaceableEvents(props));
    },
    refreshReplaceableEventsBatch: (props) => {
      assertAvailable();

      return track(refreshReplaceableEventsBatch(props));
    },
    seedEvents: (props) => {
      assertAvailable();

      return track(seedEvents(props));
    },
  };

  function shutdown(): Promise<void> {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shuttingDown = true;
    abortController.abort();

    shutdownPromise = (async () => {
      const operations = Promise.allSettled([...activeOperations]);
      let timer: ReturnType<typeof setTimeout> | null = null;

      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, RESOLUTION_SHUTDOWN_TIMEOUT_MS);
      });

      await Promise.race([operations.then(() => undefined), timeout]);

      if (timer) {
        clearTimeout(timer);
      }

      if (closeDbOnShutdown) {
        closeNostrCacheDb(db);
      }
    })();

    return shutdownPromise;
  }

  return { service, shutdown };
}
