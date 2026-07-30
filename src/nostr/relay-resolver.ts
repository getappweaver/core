import type { Event as NostrEvent } from 'nostr-tools';
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
  upsertCachedReplaceableEvent,
} from './cache/store';
import {
  NIP65_RELAY_LIST_KIND,
  PROFILE_RELAYS_FOR_QUERY,
  parseNip65RelayTags,
  uniqueRelays,
} from './nip65';
import { filterBlockedReadRelays } from './relay-notices';

export const MAX_EXPLICIT_RELAY_HINTS = 8;
export const MAX_CONTEXT_RELAYS = 8;
export const MAX_FALLBACK_RELAYS = 8;
export const MAX_RELAY_GROUPS = 5;
export const MAX_RELAYS_PER_GROUP = 8;
export const MAX_RESOLVED_RELAYS = 24;
export const MAX_CONCURRENT_RELAY_REQUESTS = 4;
export const MAX_CONCURRENT_NIP65_REQUESTS = 1;
export const MAX_RELAY_RESOLUTION_TIMEOUT_MS = 8_000;
export const DEFAULT_NIP65_REFRESH_INTERVAL_MS = 15 * 60 * 1_000;
export const DEFAULT_NIP65_RETRY_INTERVAL_MS = 60 * 1_000;

export type RelayProvenance =
  | 'explicit-hint'
  | 'cached-event'
  | 'cached-nip65'
  | 'fetched-nip65'
  | 'context'
  | 'fallback';

export type RelayGroupSource =
  | 'explicit'
  | 'cached'
  | 'nip65-write'
  | 'context'
  | 'fallback';

export type ResolvedRelay = {
  url: string;
  sources: RelayProvenance[];
  priority: number;
};

export type ResolvedRelayGroup = {
  source: RelayGroupSource;
  priority: number;
  relays: ResolvedRelay[];
};

export type ReplaceableAddress = {
  kind: number;
  pubkey: string;
  identifier: string;
};

export type ResolveEventRelaysProps = {
  eventId: string | null;
  replaceableAddress: ReplaceableAddress | null;
  authorPubkey: string | null;
  explicitHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  deadlineAtMs: number;
};

export type Nip65ResolutionStatus =
  | 'not-requested'
  | 'cache-fresh'
  | 'fetched'
  | 'cache-stale'
  | 'coalesced'
  | 'throttled'
  | 'missing'
  | 'deadline'
  | 'failed';

export type ResolveEventRelaysResult = {
  groups: ResolvedRelayGroup[];
  relays: ResolvedRelay[];
  nip65Status: Nip65ResolutionStatus;
};

export type ResolveAuthorRelaySetProps = {
  pubkey: string;
  explicitHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  deadlineAtMs: number;
};

export type ResolveAuthorRelaySetResult = {
  readRelays: string[];
  writeRelays: string[];
  nip65Status: Nip65ResolutionStatus;
};

export type RelayResolverPool = Pick<SimplePool, 'subscribeMany'>;

type CreateRelayResolverProps = {
  db: NostrCacheDb;
  pool: RelayResolverPool;
  nowMs: () => number;
  filterReadRelays: (relays: string[]) => string[];
  profileRelays: readonly string[];
  nip65RefreshIntervalMs: number;
  nip65RetryIntervalMs: number;
};

type Nip65Result = {
  event: NostrEvent | null;
  provenance: 'cached-nip65' | 'fetched-nip65' | null;
  status: Nip65ResolutionStatus;
};

type FetchNip65Props = {
  authorPubkey: string;
  bootstrapRelays: string[];
  deadlineAtMs: number;
  cachedEvent: NostrEvent | null;
};

type QueryNip65EventsProps = {
  authorPubkey: string;
  relays: string[];
  deadlineAtMs: number;
};

type QueryNip65EventsResult = {
  events: NostrEvent[];
  completion: 'eose' | 'closed' | 'deadline';
};

type ResolveNip65Props = {
  authorPubkey: string;
  bootstrapRelays: string[];
  deadlineAtMs: number;
};

type WaitForInFlightProps = {
  pending: Promise<Nip65Result>;
  deadlineAtMs: number;
  cachedEvent: NostrEvent | null;
};

type WaitForInFlightResult = {
  result: Nip65Result;
  callerTimedOut: boolean;
};

type BuildBootstrapRelaysProps = {
  explicit: string[];
  context: string[];
  profile: string[];
};

type AddRelayGroupProps = {
  source: RelayGroupSource;
  provenance: RelayProvenance;
  priority: number;
  urls: string[];
};

type QueueEntry = {
  deadlineAtMs: number;
  resolve: (release: (() => void) | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type RelayResolver = {
  resolveEventRelays: (
    props: ResolveEventRelaysProps,
  ) => Promise<ResolveEventRelaysResult>;
  resolveAuthorRelaySet: (
    props: ResolveAuthorRelaySetProps,
  ) => Promise<ResolveAuthorRelaySetResult>;
};

function newestEvent(events: NostrEvent[]): NostrEvent | null {
  return (
    events.sort(
      (left, right) =>
        right.created_at - left.created_at || left.id.localeCompare(right.id),
    )[0] ?? null
  );
}

function buildBootstrapRelays({
  explicit,
  context,
  profile,
}: BuildBootstrapRelaysProps): string[] {
  const prioritized = [
    ...explicit.slice(0, 4),
    ...context.slice(0, 2),
    ...profile.slice(0, 2),
    ...explicit,
    ...context,
    ...profile,
  ];

  return [...new Set(prioritized)].slice(0, MAX_RELAYS_PER_GROUP);
}

export function createRelayResolver({
  db,
  pool,
  nowMs,
  filterReadRelays,
  profileRelays,
  nip65RefreshIntervalMs,
  nip65RetryIntervalMs,
}: CreateRelayResolverProps): RelayResolver {
  const inFlightNip65 = new Map<string, Promise<Nip65Result>>();
  const lastNip65AttemptAt = new Map<string, number>();
  const requestQueue: QueueEntry[] = [];
  let activeRequests = 0;

  function normalizeReadRelays(
    relays: readonly string[],
    inputLimit: number,
  ): string[] {
    return filterReadRelays(uniqueRelays(relays.slice(0, inputLimit))).slice(
      0,
      MAX_RELAYS_PER_GROUP,
    );
  }

  function normalizeAllReadRelays(relays: readonly string[]): string[] {
    return filterReadRelays(uniqueRelays(relays));
  }

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

    if (activeRequests < MAX_CONCURRENT_NIP65_REQUESTS) {
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

  async function queryNip65Events({
    authorPubkey,
    relays,
    deadlineAtMs,
  }: QueryNip65EventsProps): Promise<QueryNip65EventsResult> {
    const release = await acquireRequestSlot(deadlineAtMs);

    if (!release) {
      return { events: [], completion: 'deadline' };
    }

    try {
      const remainingMs = Math.max(0, deadlineAtMs - nowMs());

      if (remainingMs === 0) {
        return { events: [], completion: 'deadline' };
      }

      if (relays.length === 0) {
        return { events: [], completion: 'eose' };
      }

      return await new Promise<QueryNip65EventsResult>((resolve, reject) => {
        const events: NostrEvent[] = [];
        const abortController = new AbortController();
        let settled = false;
        let sub: SubCloser | null = null;

        const timer = setTimeout(() => finish('deadline'), remainingMs);

        const finish = (reason: 'closed' | 'deadline' | 'eose'): void => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timer);
          abortController.abort();
          sub?.close(`relay resolver ${reason}`);
          resolve({ events, completion: reason });
        };

        const params: SubscribeManyParams = {
          maxWait: remainingMs,
          abort: abortController.signal,
          onevent: (event) => events.push(event),
          oneose: () => finish('eose'),
          onclose: () => finish('closed'),
        };

        try {
          sub = pool.subscribeMany(
            relays,
            {
              authors: [authorPubkey],
              kinds: [NIP65_RELAY_LIST_KIND],
              limit: 1,
            },
            params,
          );

          if (settled) {
            sub.close('relay resolver already settled');
          }
        } catch (error) {
          clearTimeout(timer);
          abortController.abort();
          reject(error);
        }
      });
    } finally {
      release();
    }
  }

  async function fetchNip65({
    authorPubkey,
    bootstrapRelays,
    deadlineAtMs,
    cachedEvent,
  }: FetchNip65Props): Promise<Nip65Result> {
    try {
      const queryResult = await queryNip65Events({
        authorPubkey,
        relays: bootstrapRelays,
        deadlineAtMs,
      });

      const validEvents = queryResult.events.flatMap((event) => {
        try {
          const parsed = parseNostrEvent(event);

          return parsed.kind === NIP65_RELAY_LIST_KIND &&
            parsed.pubkey === authorPubkey
            ? [parsed]
            : [];
        } catch {
          return [];
        }
      });

      const fetchedEvent = newestEvent(validEvents);
      const checkedAt = nowMs();

      if (queryResult.completion !== 'eose') {
        return {
          event: cachedEvent,
          provenance: cachedEvent ? 'cached-nip65' : null,
          status: queryResult.completion === 'deadline' ? 'deadline' : 'failed',
        };
      }

      if (fetchedEvent) {
        upsertCachedReplaceableEvent({
          db,
          event: fetchedEvent,
          kind: NIP65_RELAY_LIST_KIND,
          pubkey: authorPubkey,
          identifier: null,
          relayHints: bootstrapRelays,
          nowMs: checkedAt,
          lastCheckedAt: checkedAt,
        });

        const current = getCachedReplaceableEvent({
          db,
          kind: NIP65_RELAY_LIST_KIND,
          pubkey: authorPubkey,
          identifier: null,
        });

        return {
          event: current?.event ?? fetchedEvent,
          provenance:
            current?.event.id === fetchedEvent.id
              ? 'fetched-nip65'
              : 'cached-nip65',
          status: 'fetched',
        };
      }

      if (cachedEvent) {
        upsertCachedReplaceableEvent({
          db,
          event: cachedEvent,
          kind: NIP65_RELAY_LIST_KIND,
          pubkey: authorPubkey,
          identifier: null,
          relayHints: bootstrapRelays,
          nowMs: checkedAt,
          lastCheckedAt: checkedAt,
        });

        return {
          event: cachedEvent,
          provenance: 'cached-nip65',
          status: 'cache-stale',
        };
      }

      return { event: null, provenance: null, status: 'missing' };
    } catch {
      return {
        event: cachedEvent,
        provenance: cachedEvent ? 'cached-nip65' : null,
        status: 'failed',
      };
    }
  }

  async function waitForInFlight({
    pending,
    deadlineAtMs,
    cachedEvent,
  }: WaitForInFlightProps): Promise<WaitForInFlightResult> {
    const remainingMs = deadlineAtMs - nowMs();

    if (remainingMs <= 0) {
      return {
        result: {
          event: cachedEvent,
          provenance: cachedEvent ? 'cached-nip65' : null,
          status: 'deadline',
        },
        callerTimedOut: true,
      };
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const deadlineResult = new Promise<WaitForInFlightResult>((resolve) => {
      timer = setTimeout(
        () =>
          resolve({
            result: {
              event: cachedEvent,
              provenance: cachedEvent ? 'cached-nip65' : null,
              status: 'deadline',
            },
            callerTimedOut: true,
          }),
        remainingMs,
      );
    });

    const sharedResult = pending.then(
      (result): WaitForInFlightResult => ({ result, callerTimedOut: false }),
    );

    const outcome = await Promise.race([sharedResult, deadlineResult]);

    if (timer) {
      clearTimeout(timer);
    }

    return outcome.callerTimedOut || outcome.result.status === 'deadline'
      ? outcome
      : {
          result: { ...outcome.result, status: 'coalesced' },
          callerTimedOut: false,
        };
  }

  async function resolveNip65({
    authorPubkey,
    bootstrapRelays,
    deadlineAtMs,
  }: ResolveNip65Props): Promise<Nip65Result> {
    const cached = getCachedReplaceableEvent({
      db,
      kind: NIP65_RELAY_LIST_KIND,
      pubkey: authorPubkey,
      identifier: null,
    });

    const now = nowMs();

    if (cached && now - cached.lastCheckedAt < nip65RefreshIntervalMs) {
      return {
        event: cached.event,
        provenance: 'cached-nip65',
        status: 'cache-fresh',
      };
    }

    if (deadlineAtMs <= now) {
      return {
        event: cached?.event ?? null,
        provenance: cached ? 'cached-nip65' : null,
        status: 'deadline',
      };
    }

    const inFlight = inFlightNip65.get(authorPubkey);

    if (inFlight) {
      const outcome = await waitForInFlight({
        pending: inFlight,
        deadlineAtMs,
        cachedEvent: cached?.event ?? null,
      });

      if (
        !outcome.callerTimedOut &&
        outcome.result.status === 'deadline' &&
        deadlineAtMs > nowMs()
      ) {
        const currentInFlight = inFlightNip65.get(authorPubkey);

        if (currentInFlight === inFlight) {
          inFlightNip65.delete(authorPubkey);
        }

        if (currentInFlight === undefined || currentInFlight === inFlight) {
          lastNip65AttemptAt.delete(authorPubkey);
        }

        return resolveNip65({ authorPubkey, bootstrapRelays, deadlineAtMs });
      }

      return outcome.result;
    }

    const lastAttemptAt = lastNip65AttemptAt.get(authorPubkey);

    if (
      lastAttemptAt !== undefined &&
      now - lastAttemptAt < nip65RetryIntervalMs
    ) {
      return {
        event: cached?.event ?? null,
        provenance: cached ? 'cached-nip65' : null,
        status: 'throttled',
      };
    }

    lastNip65AttemptAt.set(authorPubkey, now);

    const pending = fetchNip65({
      authorPubkey,
      bootstrapRelays,
      deadlineAtMs,
      cachedEvent: cached?.event ?? null,
    });

    inFlightNip65.set(authorPubkey, pending);

    try {
      return await pending;
    } finally {
      if (inFlightNip65.get(authorPubkey) === pending) {
        inFlightNip65.delete(authorPubkey);
      }
    }
  }

  async function resolveEventRelays({
    eventId,
    replaceableAddress,
    authorPubkey,
    explicitHints,
    contextRelays,
    fallbackRelays,
    deadlineAtMs,
  }: ResolveEventRelaysProps): Promise<ResolveEventRelaysResult> {
    const effectiveDeadlineAtMs = Math.min(
      deadlineAtMs,
      nowMs() + MAX_RELAY_RESOLUTION_TIMEOUT_MS,
    );

    const explicit = normalizeReadRelays(
      explicitHints,
      MAX_EXPLICIT_RELAY_HINTS,
    );

    const context = normalizeReadRelays(contextRelays, MAX_CONTEXT_RELAYS);
    const fallback = normalizeReadRelays(fallbackRelays, MAX_FALLBACK_RELAYS);
    const cachedHints: string[] = [];

    if (eventId) {
      cachedHints.push(...(getCachedEventById(db, eventId)?.relayHints ?? []));
    }

    if (replaceableAddress) {
      cachedHints.push(
        ...(getCachedReplaceableEvent({
          db,
          kind: replaceableAddress.kind,
          pubkey: replaceableAddress.pubkey,
          identifier: replaceableAddress.identifier,
        })?.relayHints ?? []),
      );
    }

    const cached = normalizeReadRelays(cachedHints, MAX_RELAYS_PER_GROUP);
    let nip65: Nip65Result = {
      event: null,
      provenance: null,
      status: 'not-requested',
    };

    if (authorPubkey) {
      const normalizedAuthor = authorPubkey.toLowerCase();

      const normalizedProfile = normalizeReadRelays(
        profileRelays,
        MAX_RELAYS_PER_GROUP,
      );

      const discovery = buildBootstrapRelays({
        explicit,
        context,
        profile: normalizedProfile,
      });

      nip65 = await resolveNip65({
        authorPubkey: normalizedAuthor,
        bootstrapRelays: discovery,
        deadlineAtMs: effectiveDeadlineAtMs,
      });
    }

    const nip65WriteRelays = nip65.event
      ? normalizeReadRelays(
          parseNip65RelayTags(nip65.event.tags).writeRelays,
          MAX_RELAYS_PER_GROUP,
        )
      : [];

    const groups: ResolvedRelayGroup[] = [];
    const relaysByUrl = new Map<string, ResolvedRelay>();

    function addRelayGroup({
      source,
      provenance,
      priority,
      urls,
    }: AddRelayGroupProps): void {
      const groupRelays: ResolvedRelay[] = [];

      for (const url of urls.slice(0, MAX_RELAYS_PER_GROUP)) {
        const existing = relaysByUrl.get(url);

        if (existing) {
          if (!existing.sources.includes(provenance)) {
            existing.sources.push(provenance);
          }

          continue;
        }

        if (relaysByUrl.size >= MAX_RESOLVED_RELAYS) {
          continue;
        }

        const relay: ResolvedRelay = { url, sources: [provenance], priority };

        relaysByUrl.set(url, relay);
        groupRelays.push(relay);
      }

      if (groupRelays.length > 0 && groups.length < MAX_RELAY_GROUPS) {
        groups.push({ source, priority, relays: groupRelays });
      }
    }

    addRelayGroup({
      source: 'explicit',
      provenance: 'explicit-hint',
      priority: 1,
      urls: explicit,
    });

    addRelayGroup({
      source: 'cached',
      provenance: 'cached-event',
      priority: 2,
      urls: cached,
    });

    if (nip65.provenance) {
      addRelayGroup({
        source: 'nip65-write',
        provenance: nip65.provenance,
        priority: 3,
        urls: nip65WriteRelays,
      });
    }

    addRelayGroup({
      source: 'context',
      provenance: 'context',
      priority: 4,
      urls: context,
    });

    addRelayGroup({
      source: 'fallback',
      provenance: 'fallback',
      priority: 5,
      urls: fallback,
    });

    return {
      groups,
      relays: [...relaysByUrl.values()],
      nip65Status: nip65.status,
    };
  }

  async function resolveAuthorRelaySet({
    pubkey,
    explicitHints,
    contextRelays,
    fallbackRelays,
    deadlineAtMs,
  }: ResolveAuthorRelaySetProps): Promise<ResolveAuthorRelaySetResult> {
    const explicit = normalizeAllReadRelays(explicitHints);

    const context = normalizeAllReadRelays(contextRelays);
    const fallback = normalizeAllReadRelays(fallbackRelays);
    const profile = normalizeAllReadRelays(profileRelays);
    const discovery = buildBootstrapRelays({ explicit, context, profile });

    const nip65 = await resolveNip65({
      authorPubkey: pubkey.toLowerCase(),
      bootstrapRelays: discovery,
      deadlineAtMs: Math.min(
        deadlineAtMs,
        nowMs() + MAX_RELAY_RESOLUTION_TIMEOUT_MS,
      ),
    });

    const parsed = nip65.event ? parseNip65RelayTags(nip65.event.tags) : null;

    const defaults = normalizeAllReadRelays([
      ...explicit,
      ...context,
      ...fallback,
      ...profile,
    ]);

    return {
      readRelays:
        parsed && parsed.readRelays.length > 0
          ? normalizeAllReadRelays(parsed.readRelays)
          : defaults,
      writeRelays:
        parsed && parsed.writeRelays.length > 0
          ? normalizeAllReadRelays(parsed.writeRelays)
          : defaults,
      nip65Status: nip65.status,
    };
  }

  return { resolveEventRelays, resolveAuthorRelaySet };
}

export function createDefaultRelayResolver(
  db: NostrCacheDb,
  pool: RelayResolverPool,
): RelayResolver {
  return createRelayResolver({
    db,
    pool,
    nowMs: Date.now,
    filterReadRelays: filterBlockedReadRelays,
    profileRelays: PROFILE_RELAYS_FOR_QUERY,
    nip65RefreshIntervalMs: DEFAULT_NIP65_REFRESH_INTERVAL_MS,
    nip65RetryIntervalMs: DEFAULT_NIP65_RETRY_INTERVAL_MS,
  });
}
