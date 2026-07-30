import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type {
  SimplePool,
  SubscribeManyParams,
  SubCloser,
} from 'nostr-tools/pool';

import type { NostrCacheDb } from './cache/db';
import { parseNostrEvent } from './cache/schema';
import {
  getCachedEventById,
  getCachedReplaceableEvent,
  isReplaceableKind,
  markCachedReplaceableChecked,
  putCachedEventById,
  updateCachedEventAccess,
  updateCachedReplaceableAccess,
  upsertCachedReplaceableEvent,
} from './cache/store';
import type {
  CountNewerEventsProps,
  CountNewerResult,
  EventCacheAddressProps,
  EventQueryCompletion,
  EventQueryResult,
  EventResolutionCache,
  EventResolutionNetwork,
  FetchLatestReplaceableProps,
  QueryEventsUntilEoseProps,
  QueryFirstValidEventProps,
  ResolveEventByIdProps,
  ResolvedEvent,
  ResolvedReplaceableEvent,
  ResolveReplaceableEventProps,
} from './event-resolution-types';
import { uniqueRelays } from './nip65';
import {
  MAX_CONCURRENT_RELAY_REQUESTS,
  MAX_RESOLVED_RELAYS,
  type RelayResolver,
  type ResolvedRelayGroup,
} from './relay-resolver';

export const DEFAULT_REPLACEABLE_REFRESH_INTERVAL_MS = 15 * 60 * 1_000;
export const DEFAULT_REPLACEABLE_RETRY_INTERVAL_MS = 60 * 1_000;

export type EventResolverPool = Pick<SimplePool, 'subscribeMany'>;

type BoundedCountNewer = (
  props: CountNewerEventsProps,
) => Promise<CountNewerResult>;

type CreatePoolEventResolutionNetworkProps = {
  pool: EventResolverPool;
  nowMs: () => number;
  countNewer: BoundedCountNewer | null;
};

type CreateEventResolverProps = {
  cache: EventResolutionCache;
  relayResolver: RelayResolver;
  network: EventResolutionNetwork;
  nowMs: () => number;
  runInBackground: (task: Promise<void>) => void;
  refreshRetryIntervalMs: number;
};

type QueryPoolProps = {
  relays: string[];
  filter: Filter;
  deadlineAtMs: number;
  validate: ((event: unknown) => NostrEvent | null) | null;
};

type QueueEntry = {
  deadlineAtMs: number;
  resolve: (release: (() => void) | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

type FetchLatestResult = {
  event: NostrEvent | null;
  completed: boolean;
  attemptedGroups: number;
  relayHints: string[];
  failure: 'deadline' | 'network-failed' | null;
};

type RefreshOutcome = {
  event: NostrEvent;
  success: boolean;
  networkHit: boolean;
  attemptedGroups: number;
  reason: 'completed' | 'deadline' | 'failed';
};

type RefreshEntry = {
  promise: Promise<RefreshOutcome>;
  deadlineAtMs: number;
};

type RefreshReplaceableProps = {
  cachedEvent: NostrEvent;
  kind: number;
  pubkey: string;
  identifier: string;
  relayHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  deadlineAtMs: number;
};

type StartRefreshProps = RefreshReplaceableProps & {
  key: string;
};

type WaitForRefreshProps = {
  entry: RefreshEntry;
  deadlineAtMs: number;
};

type WaitForRefreshResult = {
  outcome: RefreshOutcome | null;
  callerTimedOut: boolean;
};

export type EventResolver = {
  resolveEventById: (props: ResolveEventByIdProps) => Promise<ResolvedEvent>;
  resolveReplaceableEvent: (
    props: ResolveReplaceableEventProps,
  ) => Promise<ResolvedReplaceableEvent>;
};

function normalizeIdentifier(identifier: string | null): string {
  return identifier ?? '';
}

function isHex64(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function newestEvent(events: NostrEvent[]): NostrEvent | null {
  return (
    events.sort(
      (left, right) =>
        right.created_at - left.created_at || left.id.localeCompare(right.id),
    )[0] ?? null
  );
}

function replaceableFilter({
  kind,
  pubkey,
  identifier,
}: EventCacheAddressProps): Filter {
  return {
    kinds: [kind],
    authors: [pubkey],
    ...(kind >= 30_000 && kind < 40_000 ? { '#d': [identifier ?? ''] } : {}),
    limit: 1,
  };
}

function validateReplaceableEvent({
  event,
  kind,
  pubkey,
  identifier,
}: EventCacheAddressProps & { event: unknown }): NostrEvent | null {
  try {
    const parsed = parseNostrEvent(event);

    if (parsed.kind !== kind || parsed.pubkey !== pubkey) {
      return null;
    }

    const parsedIdentifier =
      kind >= 30_000 && kind < 40_000
        ? (parsed.tags.find((tag) => tag[0] === 'd')?.[1] ?? '')
        : '';

    return parsedIdentifier === (identifier ?? '') ? parsed : null;
  } catch {
    return null;
  }
}

function groupRelayHints(groups: ResolvedRelayGroup[]): string[] {
  return uniqueRelays(
    groups.flatMap((group) => group.relays.map((relay) => relay.url)),
  );
}

export function createSqliteEventResolutionCache(
  db: NostrCacheDb,
): EventResolutionCache {
  return {
    getEventById: (eventId) => getCachedEventById(db, eventId),
    putEventById: (props) => putCachedEventById({ db, ...props }),
    updateEventAccess: (props) => updateCachedEventAccess({ db, ...props }),
    getReplaceable: (props) => getCachedReplaceableEvent({ db, ...props }),
    upsertReplaceable: (props) =>
      upsertCachedReplaceableEvent({ db, ...props }),
    updateReplaceableAccess: (props) =>
      updateCachedReplaceableAccess({ db, ...props }),
    markReplaceableChecked: (props) =>
      markCachedReplaceableChecked({ db, ...props }),
  };
}

export function createPoolEventResolutionNetwork({
  pool,
  nowMs,
  countNewer,
}: CreatePoolEventResolutionNetworkProps): EventResolutionNetwork {
  const requestQueue: QueueEntry[] = [];
  let activeRequests = 0;

  function releaseRequestSlot(): void {
    while (requestQueue.length > 0) {
      const next = requestQueue.shift();

      if (!next) {
        break;
      }

      clearTimeout(next.timer);

      if (next.deadlineAtMs <= nowMs()) {
        next.resolve(null);
        continue;
      }

      next.resolve(releaseRequestSlot);

      return;
    }

    activeRequests -= 1;
  }

  function acquireRequestSlot(
    deadlineAtMs: number,
  ): Promise<(() => void) | null> {
    if (deadlineAtMs <= nowMs()) {
      return Promise.resolve(null);
    }

    if (activeRequests < MAX_CONCURRENT_RELAY_REQUESTS) {
      activeRequests += 1;

      return Promise.resolve(releaseRequestSlot);
    }

    return new Promise((resolve) => {
      const entry: QueueEntry = {
        deadlineAtMs,
        resolve,
        timer: setTimeout(
          () => {
            const index = requestQueue.indexOf(entry);

            if (index >= 0) {
              requestQueue.splice(index, 1);
            }

            resolve(null);
          },
          Math.max(0, deadlineAtMs - nowMs()),
        ),
      };

      requestQueue.push(entry);
    });
  }

  async function queryPool({
    relays,
    filter,
    deadlineAtMs,
    validate,
  }: QueryPoolProps): Promise<EventQueryResult> {
    const release = await acquireRequestSlot(deadlineAtMs);

    if (!release) {
      return { events: [], completion: 'deadline' };
    }

    try {
      const remainingMs = deadlineAtMs - nowMs();

      if (remainingMs <= 0) {
        return { events: [], completion: 'deadline' };
      }

      if (relays.length === 0) {
        return { events: [], completion: 'eose' };
      }

      return await new Promise<EventQueryResult>((resolve) => {
        const events: unknown[] = [];
        const abortController = new AbortController();
        let settled = false;
        let sub: SubCloser | null = null;

        const timer = setTimeout(() => finish('deadline'), remainingMs);

        const finish = (completion: EventQueryCompletion): void => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timer);
          abortController.abort();
          sub?.close(`event resolver ${completion}`);
          resolve({ events, completion });
        };

        const params: SubscribeManyParams = {
          maxWait: remainingMs,
          abort: abortController.signal,
          onevent: (event) => {
            if (settled) {
              return;
            }

            if (!validate) {
              events.push(event);

              return;
            }

            const accepted = validate(event);

            if (accepted) {
              events.push(accepted);
              finish('eose');
            }
          },
          oneose: () => finish('eose'),
          onclose: () => finish('closed'),
        };

        try {
          sub = pool.subscribeMany(relays, filter, params);

          if (settled) {
            sub.close('event resolver already settled');
          }
        } catch {
          finish('failed');
        }
      });
    } finally {
      release();
    }
  }

  async function boundedCountNewer(
    props: CountNewerEventsProps,
  ): Promise<CountNewerResult> {
    if (!countNewer) {
      return 'unsupported';
    }

    const release = await acquireRequestSlot(props.deadlineAtMs);

    if (!release) {
      return 'deadline';
    }

    const remainingMs = props.deadlineAtMs - nowMs();

    if (remainingMs <= 0) {
      release();

      return 'deadline';
    }

    const operation = countNewer(props).catch((): CountNewerResult => 'failed');
    let timer: ReturnType<typeof setTimeout> | null = null;

    const timeout = new Promise<{
      result: CountNewerResult;
      timedOut: boolean;
    }>((resolve) => {
      timer = setTimeout(
        () => resolve({ result: 'deadline', timedOut: true }),
        remainingMs,
      );
    });

    const completed = operation.then((result) => ({
      result,
      timedOut: false,
    }));

    const outcome = await Promise.race([completed, timeout]);

    if (timer) {
      clearTimeout(timer);
    }

    if (outcome.timedOut) {
      void operation.finally(release);
    } else {
      release();
    }

    return outcome.result;
  }

  return {
    queryFirstValid: (props: QueryFirstValidEventProps) =>
      queryPool({
        relays: props.relays,
        filter: props.filter,
        deadlineAtMs: props.deadlineAtMs,
        validate: props.validate,
      }),
    queryUntilEose: (props: QueryEventsUntilEoseProps) =>
      queryPool({
        relays: props.relays,
        filter: props.filter,
        deadlineAtMs: props.deadlineAtMs,
        validate: null,
      }),
    countNewer: boundedCountNewer,
  };
}

export function createEventResolver({
  cache,
  relayResolver,
  network,
  nowMs,
  runInBackground,
  refreshRetryIntervalMs,
}: CreateEventResolverProps): EventResolver {
  const inFlightRefreshes = new Map<string, RefreshEntry>();
  const lastRefreshAttemptAt = new Map<string, number>();

  async function fetchLatestReplaceable({
    groups,
    kind,
    pubkey,
    identifier,
    deadlineAtMs,
    maxRelayAttempts,
  }: FetchLatestReplaceableProps): Promise<FetchLatestResult> {
    const events: NostrEvent[] = [];
    const attemptedHints: string[] = [];
    let attemptedGroups = 0;
    let remainingRelayAttempts = maxRelayAttempts;
    let completed = groups.length > 0;
    let failure: FetchLatestResult['failure'] = null;

    for (const group of groups) {
      if (deadlineAtMs <= nowMs()) {
        completed = false;
        failure = 'deadline';
        break;
      }

      if (remainingRelayAttempts <= 0) {
        completed = false;
        break;
      }

      const relays = group.relays
        .map((relay) => relay.url)
        .slice(0, remainingRelayAttempts);

      if (relays.length < group.relays.length) {
        completed = false;
      }

      if (relays.length === 0) {
        continue;
      }

      attemptedGroups += 1;
      attemptedHints.push(...relays);
      remainingRelayAttempts -= relays.length;

      const result = await network.queryUntilEose({
        relays,
        filter: replaceableFilter({ kind, pubkey, identifier }),
        deadlineAtMs,
      });

      for (const event of result.events) {
        const valid = validateReplaceableEvent({
          event,
          kind,
          pubkey,
          identifier,
        });

        if (valid) {
          events.push(valid);
        }
      }

      if (result.completion !== 'eose') {
        completed = false;

        failure =
          result.completion === 'deadline' ? 'deadline' : 'network-failed';
      }
    }

    return {
      event: newestEvent(events),
      completed,
      attemptedGroups,
      relayHints: uniqueRelays(attemptedHints),
      failure,
    };
  }

  async function refreshReplaceable({
    cachedEvent,
    kind,
    pubkey,
    identifier,
    relayHints,
    contextRelays,
    fallbackRelays,
    deadlineAtMs,
  }: RefreshReplaceableProps): Promise<RefreshOutcome> {
    try {
      const relayResult = await relayResolver.resolveEventRelays({
        eventId: null,
        replaceableAddress: { kind, pubkey, identifier },
        authorPubkey: pubkey,
        explicitHints: relayHints,
        contextRelays,
        fallbackRelays,
        deadlineAtMs,
      });

      if (relayResult.groups.length === 0 || deadlineAtMs <= nowMs()) {
        return {
          event: cachedEvent,
          success: false,
          networkHit: false,
          attemptedGroups: 0,
          reason: 'deadline',
        };
      }

      let remainingRelayAttempts = MAX_RESOLVED_RELAYS;
      let refreshCompleted = true;
      let attemptedGroups = 0;
      let failure: FetchLatestResult['failure'] = null;
      const fetchedEvents: NostrEvent[] = [];
      const fetchedHints: string[] = [];

      for (const group of relayResult.groups) {
        const relays = group.relays.map((relay) => relay.url);

        if (relays.length > remainingRelayAttempts) {
          refreshCompleted = false;
          break;
        }

        const count = await network.countNewer({
          relays,
          filter: {
            ...replaceableFilter({ kind, pubkey, identifier }),
            since: cachedEvent.created_at + 1,
          },
          deadlineAtMs,
        });

        if (count !== 'unsupported') {
          remainingRelayAttempts -= relays.length;
          attemptedGroups += 1;
        }

        if (count === 'deadline') {
          return {
            event: cachedEvent,
            success: false,
            networkHit: false,
            attemptedGroups,
            reason: 'deadline',
          };
        }

        if (count === 'zero') {
          continue;
        }

        const fetched = await fetchLatestReplaceable({
          groups: [group],
          kind,
          pubkey,
          identifier,
          deadlineAtMs,
          maxRelayAttempts: remainingRelayAttempts,
        });

        remainingRelayAttempts -= fetched.relayHints.length;
        attemptedGroups += fetched.attemptedGroups;
        fetchedHints.push(...fetched.relayHints);

        if (fetched.event) {
          fetchedEvents.push(fetched.event);
        }

        if (!fetched.completed) {
          refreshCompleted = false;
          failure = fetched.failure;
        }
      }

      const fetchedEvent = newestEvent(fetchedEvents);
      const checkedAt = refreshCompleted ? nowMs() : 0;

      if (fetchedEvent) {
        cache.upsertReplaceable({
          event: fetchedEvent,
          kind,
          pubkey,
          identifier,
          relayHints: uniqueRelays([...relayHints, ...fetchedHints]),
          nowMs: nowMs(),
          lastCheckedAt: checkedAt,
        });
      } else if (refreshCompleted) {
        cache.markReplaceableChecked({
          kind,
          pubkey,
          identifier,
          checkedAtMs: nowMs(),
        });
      }

      const current =
        cache.getReplaceable({ kind, pubkey, identifier })?.event ??
        cachedEvent;

      return {
        event: current,
        success: refreshCompleted,
        networkHit: current.id !== cachedEvent.id,
        attemptedGroups,
        reason: refreshCompleted
          ? 'completed'
          : failure === 'deadline'
            ? 'deadline'
            : 'failed',
      };
    } catch {
      return {
        event: cachedEvent,
        success: false,
        networkHit: false,
        attemptedGroups: 0,
        reason: 'failed',
      };
    }
  }

  function startRefresh({ key, ...props }: StartRefreshProps): RefreshEntry {
    const basePromise = refreshReplaceable(props);

    const entry: RefreshEntry = {
      promise: Promise.resolve({
        event: props.cachedEvent,
        success: false,
        networkHit: false,
        attemptedGroups: 0,
        reason: 'failed',
      }),
      deadlineAtMs: props.deadlineAtMs,
    };

    entry.promise = basePromise.finally(() => {
      if (inFlightRefreshes.get(key) === entry) {
        inFlightRefreshes.delete(key);
      }
    });

    inFlightRefreshes.set(key, entry);
    lastRefreshAttemptAt.set(key, nowMs());

    return entry;
  }

  async function waitForRefresh({
    entry,
    deadlineAtMs,
  }: WaitForRefreshProps): Promise<WaitForRefreshResult> {
    const remainingMs = deadlineAtMs - nowMs();

    if (remainingMs <= 0) {
      return { outcome: null, callerTimedOut: true };
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const timeout = new Promise<WaitForRefreshResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ outcome: null, callerTimedOut: true }),
        remainingMs,
      );
    });

    const completed = entry.promise.then(
      (outcome): WaitForRefreshResult => ({
        outcome,
        callerTimedOut: false,
      }),
    );

    const result = await Promise.race([completed, timeout]);

    if (timer) {
      clearTimeout(timer);
    }

    return result;
  }

  async function resolveEventById({
    eventId,
    authorPubkey,
    relayHints,
    contextRelays,
    fallbackRelays,
    deadlineAtMs,
  }: ResolveEventByIdProps): Promise<ResolvedEvent> {
    const normalizedEventId = eventId.toLowerCase();
    const normalizedHints = uniqueRelays(relayHints);

    if (!isHex64(normalizedEventId)) {
      return {
        event: null,
        source: 'missing',
        relayHints: normalizedHints,
        diagnostic: { code: 'invalid-request', attemptedGroups: 0 },
      };
    }

    const cached = cache.getEventById(normalizedEventId);

    if (cached) {
      cache.updateEventAccess({
        eventId: normalizedEventId,
        relayHints: normalizedHints,
        nowMs: nowMs(),
      });

      const current = cache.getEventById(normalizedEventId) ?? cached;

      return {
        event: current.event,
        source: 'cache',
        relayHints: current.relayHints,
        diagnostic: { code: 'cache-hit', attemptedGroups: 0 },
      };
    }

    try {
      const relayResult = await relayResolver.resolveEventRelays({
        eventId: normalizedEventId,
        replaceableAddress: null,
        authorPubkey,
        explicitHints: normalizedHints,
        contextRelays,
        fallbackRelays,
        deadlineAtMs,
      });

      const attemptedGroups: ResolvedRelayGroup[] = [];
      let failureCode: 'deadline' | 'network-failed' | null = null;

      for (const group of relayResult.groups) {
        if (deadlineAtMs <= nowMs()) {
          break;
        }

        attemptedGroups.push(group);

        const result = await network.queryFirstValid({
          relays: group.relays.map((relay) => relay.url),
          filter: { ids: [normalizedEventId], limit: 1 },
          deadlineAtMs,
          validate: (event) => {
            try {
              const parsed = parseNostrEvent(event);

              return parsed.id === normalizedEventId ? parsed : null;
            } catch {
              return null;
            }
          },
        });

        const found = result.events[0] as NostrEvent | undefined;

        if (!found) {
          if (result.completion === 'deadline') {
            failureCode = 'deadline';
          } else if (
            result.completion === 'closed' ||
            result.completion === 'failed'
          ) {
            failureCode = 'network-failed';
          }

          continue;
        }

        const attemptedHints = groupRelayHints(attemptedGroups);

        const mergedHints = uniqueRelays([
          ...normalizedHints,
          ...attemptedHints,
        ]);

        cache.putEventById({
          event: found,
          requestedEventId: normalizedEventId,
          relayHints: mergedHints,
          nowMs: nowMs(),
        });

        return {
          event: found,
          source: 'network',
          relayHints: mergedHints,
          diagnostic: {
            code: 'network-hit',
            attemptedGroups: attemptedGroups.length,
          },
        };
      }

      return {
        event: null,
        source: 'missing',
        relayHints: uniqueRelays([
          ...normalizedHints,
          ...groupRelayHints(attemptedGroups),
        ]),
        diagnostic: {
          code:
            deadlineAtMs <= nowMs() ? 'deadline' : (failureCode ?? 'missing'),
          attemptedGroups: attemptedGroups.length,
        },
      };
    } catch {
      return {
        event: null,
        source: 'missing',
        relayHints: normalizedHints,
        diagnostic: { code: 'network-failed', attemptedGroups: 0 },
      };
    }
  }

  async function resolveReplaceableEvent({
    kind,
    pubkey: inputPubkey,
    identifier: inputIdentifier,
    relayHints,
    contextRelays,
    fallbackRelays,
    refreshMode,
    refreshIntervalMs,
    deadlineAtMs,
  }: ResolveReplaceableEventProps): Promise<ResolvedReplaceableEvent> {
    const pubkey = inputPubkey.toLowerCase();
    const identifier = normalizeIdentifier(inputIdentifier);
    const normalizedHints = uniqueRelays(relayHints);

    if (!isReplaceableKind(kind) || !isHex64(pubkey)) {
      return {
        event: null,
        source: 'missing',
        relayHints: normalizedHints,
        refresh: 'failed',
        diagnostic: { code: 'invalid-request', attemptedGroups: 0 },
      };
    }

    const address = { kind, pubkey, identifier };
    const cached = cache.getReplaceable(address);

    if (!cached) {
      try {
        const relayResult = await relayResolver.resolveEventRelays({
          eventId: null,
          replaceableAddress: address,
          authorPubkey: pubkey,
          explicitHints: normalizedHints,
          contextRelays,
          fallbackRelays,
          deadlineAtMs,
        });

        const discovered = cache.getReplaceable(address);

        if (discovered) {
          cache.updateReplaceableAccess({
            ...address,
            relayHints: normalizedHints,
            nowMs: nowMs(),
          });

          const current = cache.getReplaceable(address) ?? discovered;

          return {
            event: current.event,
            source: 'network',
            relayHints: current.relayHints,
            refresh: 'completed',
            diagnostic: { code: 'network-hit', attemptedGroups: 0 },
          };
        }

        const fetched = await fetchLatestReplaceable({
          groups: relayResult.groups,
          kind,
          pubkey,
          identifier,
          deadlineAtMs,
          maxRelayAttempts: MAX_RESOLVED_RELAYS,
        });

        if (!fetched.event) {
          return {
            event: null,
            source: 'missing',
            relayHints: uniqueRelays([
              ...normalizedHints,
              ...fetched.relayHints,
            ]),
            refresh: 'failed',
            diagnostic: {
              code: fetched.completed
                ? 'missing'
                : fetched.failure === 'deadline'
                  ? 'deadline'
                  : 'network-failed',
              attemptedGroups: fetched.attemptedGroups,
            },
          };
        }

        cache.upsertReplaceable({
          event: fetched.event,
          ...address,
          relayHints: uniqueRelays([...normalizedHints, ...fetched.relayHints]),
          nowMs: nowMs(),
          lastCheckedAt: fetched.completed ? nowMs() : 0,
        });

        const current = cache.getReplaceable(address);

        return {
          event: current?.event ?? fetched.event,
          source: 'network',
          relayHints: current?.relayHints ?? fetched.relayHints,
          refresh: fetched.completed ? 'completed' : 'failed',
          diagnostic: {
            code: 'network-hit',
            attemptedGroups: fetched.attemptedGroups,
          },
        };
      } catch {
        return {
          event: null,
          source: 'missing',
          relayHints: normalizedHints,
          refresh: 'failed',
          diagnostic: { code: 'network-failed', attemptedGroups: 0 },
        };
      }
    }

    cache.updateReplaceableAccess({
      ...address,
      relayHints: normalizedHints,
      nowMs: nowMs(),
    });

    const current = cache.getReplaceable(address) ?? cached;
    const refreshDue = nowMs() - current.lastCheckedAt >= refreshIntervalMs;

    if (!refreshDue) {
      return {
        event: current.event,
        source: 'cache',
        relayHints: current.relayHints,
        refresh: 'not-due',
        diagnostic: { code: 'cache-hit', attemptedGroups: 0 },
      };
    }

    const key = `${kind}:${pubkey}:${identifier}`;
    let entry = inFlightRefreshes.get(key);
    const wasCoalesced = entry !== undefined;

    if (!entry) {
      const lastAttempt = lastRefreshAttemptAt.get(key);

      if (
        lastAttempt !== undefined &&
        nowMs() - lastAttempt < refreshRetryIntervalMs
      ) {
        return {
          event: current.event,
          source: 'cache',
          relayHints: current.relayHints,
          refresh: 'failed',
          diagnostic: { code: 'refresh-failed', attemptedGroups: 0 },
        };
      }

      entry = startRefresh({
        key,
        cachedEvent: current.event,
        ...address,
        relayHints: current.relayHints,
        contextRelays,
        fallbackRelays,
        deadlineAtMs,
      });
    }

    if (refreshMode === 'stale-while-revalidate') {
      runInBackground(entry.promise.then(() => undefined));

      return {
        event: current.event,
        source: 'cache',
        relayHints: current.relayHints,
        refresh: wasCoalesced ? 'coalesced' : 'scheduled',
        diagnostic: {
          code: wasCoalesced ? 'refresh-coalesced' : 'refresh-scheduled',
          attemptedGroups: 0,
        },
      };
    }

    let waited = await waitForRefresh({ entry, deadlineAtMs });

    if (
      !waited.callerTimedOut &&
      waited.outcome?.reason === 'deadline' &&
      entry.deadlineAtMs < deadlineAtMs
    ) {
      const currentEntry = inFlightRefreshes.get(key);

      if (currentEntry === undefined || currentEntry === entry) {
        if (currentEntry === entry) {
          inFlightRefreshes.delete(key);
        }

        lastRefreshAttemptAt.delete(key);

        entry = startRefresh({
          key,
          cachedEvent: current.event,
          ...address,
          relayHints: current.relayHints,
          contextRelays,
          fallbackRelays,
          deadlineAtMs,
        });
      } else {
        entry = currentEntry;
      }

      waited = await waitForRefresh({ entry, deadlineAtMs });
    }

    if (!waited.outcome?.success) {
      return {
        event: current.event,
        source: 'cache',
        relayHints: current.relayHints,
        refresh: 'failed',
        diagnostic: {
          code: 'refresh-failed',
          attemptedGroups: waited.outcome?.attemptedGroups ?? 0,
        },
      };
    }

    const refreshed = cache.getReplaceable(address);

    return {
      event: refreshed?.event ?? waited.outcome.event,
      source: waited.outcome.networkHit ? 'network' : 'cache',
      relayHints: refreshed?.relayHints ?? current.relayHints,
      refresh: 'completed',
      diagnostic: {
        code: 'refresh-completed',
        attemptedGroups: waited.outcome.attemptedGroups,
      },
    };
  }

  return { resolveEventById, resolveReplaceableEvent };
}
