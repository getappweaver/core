import type { Event } from 'nostr-tools/core';

import type {
  CachedProfile,
  CachedRelayList,
  CoreDb,
  LegacyWotEventKind,
} from '@src/db';
import {
  clearLegacyWotEvent,
  getCachedContactList,
  getCachedProfiles,
  getCachedRelayList,
  getLegacyWotEvent,
  getWotFollowsWhoFollow,
  getWotScore,
  upsertCachedContactList,
  upsertCachedProfile,
  upsertCachedRelayList,
} from '@src/db';
import { debug } from '@src/logger';

import { DEFAULT_REPLACEABLE_REFRESH_INTERVAL_MS } from './event-resolver';
import {
  parseNip65RelayTags,
  PROFILE_RELAYS_FOR_QUERY,
  uniqueRelays,
} from './nip65';
import type { NostrResolutionService } from './resolution-service';
import { normalizePubkeyInput, parseFollowList } from './wot';

const CONTACT_LIST_KIND = 3;
const PROFILE_KIND = 0;
const RELAY_LIST_KIND = 10002;
const PROFILE_CONCURRENCY = 4;

export type RelayAuthorGroup = {
  relay: string;
  authors: string[];
};

export type WotServices = {
  getWotScore: (pubkey: string, rootPubkey?: string) => number | null;
  getFollowsWhoFollow: (pubkey: string, rootPubkey?: string) => string[] | null;
  getFollows: (pubkey: string) => Promise<string[]>;
  getProfiles: (props: GetProfilesProps) => Promise<Map<string, CachedProfile>>;
  getRelayList: (pubkey: string) => Promise<CachedRelayList | null>;
  getRelayAuthorMap: (pubkeys: string[]) => Promise<RelayAuthorGroup[]>;
  refreshRelayLists?: (pubkeys: string[]) => Promise<void>;
};

export type GetProfilesProps = {
  pubkeys: string[];
  waitForMissing: boolean;
};

type CreateWotServicesProps = {
  db: CoreDb;
  nostrResolution: NostrResolutionService;
  rootPubkey: string;
  fallbackRelays: string[];
};

type ProfileMetadata = {
  name: string | null;
  displayName: string | null;
  picture: string | null;
  about: string | null;
};

type ResolveAndCacheProps = {
  kind: LegacyWotEventKind;
  pubkey: string;
  refreshMode: 'stale-while-revalidate' | 'require-fresh';
};

type MapWithConcurrencyProps<T, R> = {
  items: T[];
  concurrency: number;
  map: (item: T) => Promise<R>;
};

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseProfileMetadata(content: string): ProfileMetadata {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;

    return {
      name: stringField(parsed.name),
      displayName:
        stringField(parsed.display_name) ?? stringField(parsed.displayName),
      picture: stringField(parsed.picture) ?? stringField(parsed.image),
      about: stringField(parsed.about),
    };
  } catch {
    return { name: null, displayName: null, picture: null, about: null };
  }
}

async function mapWithConcurrency<T, R>({
  items,
  concurrency,
  map,
}: MapWithConcurrencyProps<T, R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;

      nextIndex += 1;
      results[index] = await map(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

function legacyMetadataMatches({
  input,
  kind,
  pubkey,
  eventId,
  createdAt,
}: {
  input: unknown;
  kind: LegacyWotEventKind;
  pubkey: string;
  eventId: string;
  createdAt: number;
}): boolean {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const event = input as Partial<Event>;

  return (
    event.kind === kind &&
    event.pubkey?.toLowerCase() === pubkey &&
    event.id?.toLowerCase() === eventId &&
    event.created_at === createdAt
  );
}

export function createWotServices({
  db,
  nostrResolution,
  rootPubkey,
  fallbackRelays,
}: CreateWotServicesProps): WotServices {
  const relays = uniqueRelays([...PROFILE_RELAYS_FOR_QUERY, ...fallbackRelays]);
  const pendingRelayListRefreshes = new Set<string>();
  let relayListRefreshPromise: Promise<void> | null = null;

  async function migrateLegacy(
    kind: LegacyWotEventKind,
    pubkey: string,
  ): Promise<void> {
    const legacy = getLegacyWotEvent({ db, kind, pubkey });

    if (!legacy?.rawJson) {
      return;
    }

    try {
      const event = JSON.parse(legacy.rawJson) as unknown;

      if (
        !legacyMetadataMatches({
          input: event,
          kind,
          pubkey: legacy.pubkey,
          eventId: legacy.eventId,
          createdAt: legacy.createdAt,
        })
      ) {
        return;
      }

      const result = await nostrResolution.seedEvents({
        entries: [
          {
            event,
            relayHints: [],
            lastCheckedAtMs: legacy.fetchedAt * 1_000,
          },
        ],
      });

      if (result.seeded === 1) {
        clearLegacyWotEvent({
          db,
          kind,
          pubkey: legacy.pubkey,
          eventId: legacy.eventId,
        });
      }
    } catch (error) {
      debug(
        `wot-service legacy seed failed for ${kind}:${pubkey}: ${String(error)}`,
      );
    }
  }

  function cacheDerivedEvent(kind: LegacyWotEventKind, event: Event): void {
    if (kind === CONTACT_LIST_KIND) {
      upsertCachedContactList({
        db,
        pubkey: event.pubkey,
        eventId: event.id,
        createdAt: event.created_at,
        follows: parseFollowList(event).map((follow) => follow.pubkey),
        rawJson: '',
      });

      return;
    }

    if (kind === RELAY_LIST_KIND) {
      const parsed = parseNip65RelayTags(event.tags);

      upsertCachedRelayList({
        db,
        pubkey: event.pubkey,
        eventId: event.id,
        createdAt: event.created_at,
        readRelays: parsed.readRelays,
        writeRelays: parsed.writeRelays,
        rawJson: '',
      });

      return;
    }

    const metadata = parseProfileMetadata(event.content);

    upsertCachedProfile({
      db,
      pubkey: event.pubkey,
      eventId: event.id,
      createdAt: event.created_at,
      name: metadata.name,
      displayName: metadata.displayName,
      picture: metadata.picture,
      about: metadata.about,
      rawJson: '',
    });
  }

  async function resolveAndCache({
    kind,
    pubkey,
    refreshMode,
  }: ResolveAndCacheProps): Promise<Event | null> {
    const result = await nostrResolution.resolveReplaceableEvent({
      kind,
      pubkey,
      identifier: null,
      relayHints: [],
      contextRelays: fallbackRelays,
      fallbackRelays: relays,
      refreshMode,
      refreshIntervalMs: DEFAULT_REPLACEABLE_REFRESH_INTERVAL_MS,
      deadlineAtMs: Date.now() + 8_000,
    });

    if (result.event) {
      cacheDerivedEvent(kind, result.event);
    }

    return result.event;
  }

  function refreshInBackground(kind: LegacyWotEventKind, pubkey: string): void {
    void resolveAndCache({ kind, pubkey, refreshMode: 'require-fresh' }).catch(
      (error) =>
        debug(
          `wot-service refresh failed for ${kind}:${pubkey}: ${String(error)}`,
        ),
    );
  }

  function refreshRelayLists(pubkeys: string[]): Promise<void> {
    for (const pubkey of pubkeys) {
      pendingRelayListRefreshes.add(normalizePubkeyInput(pubkey));
    }

    if (relayListRefreshPromise) {
      return relayListRefreshPromise;
    }

    relayListRefreshPromise = (async () => {
      while (pendingRelayListRefreshes.size > 0) {
        const batch = [...pendingRelayListRefreshes];

        pendingRelayListRefreshes.clear();

        const events = await nostrResolution.refreshReplaceableEventsBatch({
          kind: RELAY_LIST_KIND,
          pubkeys: batch,
          identifier: null,
          contextRelays: fallbackRelays,
          fallbackRelays: relays,
          refreshIntervalMs: DEFAULT_REPLACEABLE_REFRESH_INTERVAL_MS,
          deadlineAtMs: Date.now() + 8_000,
        });

        for (const event of events) {
          cacheDerivedEvent(RELAY_LIST_KIND, event);
        }

        debug(
          `wot-service refreshed relay lists in batches: ${events.length}/${batch.length} cached`,
        );
      }
    })().finally(() => {
      relayListRefreshPromise = null;
    });

    return relayListRefreshPromise;
  }

  return {
    getWotScore: (pubkey: string, scoreRootPubkey = rootPubkey) => {
      try {
        return getWotScore(
          db,
          normalizePubkeyInput(pubkey),
          normalizePubkeyInput(scoreRootPubkey),
        );
      } catch {
        return null;
      }
    },

    getFollowsWhoFollow: (pubkey: string, queryRootPubkey = rootPubkey) => {
      try {
        return getWotFollowsWhoFollow({
          db,
          targetPubkey: normalizePubkeyInput(pubkey),
          rootPubkey: normalizePubkeyInput(queryRootPubkey),
        });
      } catch {
        return null;
      }
    },

    async getFollows(pubkey: string): Promise<string[]> {
      const normalizedPubkey = normalizePubkeyInput(pubkey);
      const cached = getCachedContactList(db, normalizedPubkey);

      await migrateLegacy(CONTACT_LIST_KIND, normalizedPubkey);

      if (cached) {
        refreshInBackground(CONTACT_LIST_KIND, normalizedPubkey);

        return cached.follows;
      }

      await resolveAndCache({
        kind: CONTACT_LIST_KIND,
        pubkey: normalizedPubkey,
        refreshMode: 'require-fresh',
      });

      return getCachedContactList(db, normalizedPubkey)?.follows ?? [];
    },

    async getRelayList(pubkey: string): Promise<CachedRelayList | null> {
      const normalizedPubkey = normalizePubkeyInput(pubkey);
      const cached = getCachedRelayList(db, normalizedPubkey);

      await migrateLegacy(RELAY_LIST_KIND, normalizedPubkey);

      if (cached) {
        refreshInBackground(RELAY_LIST_KIND, normalizedPubkey);

        return cached;
      }

      await resolveAndCache({
        kind: RELAY_LIST_KIND,
        pubkey: normalizedPubkey,
        refreshMode: 'require-fresh',
      });

      return getCachedRelayList(db, normalizedPubkey);
    },

    async getProfiles({
      pubkeys,
      waitForMissing,
    }: GetProfilesProps): Promise<Map<string, CachedProfile>> {
      const normalizedPubkeys = [
        ...new Set(pubkeys.map((pubkey) => normalizePubkeyInput(pubkey))),
      ];

      await mapWithConcurrency({
        items: normalizedPubkeys,
        concurrency: PROFILE_CONCURRENCY,
        map: async (pubkey) => migrateLegacy(PROFILE_KIND, pubkey),
      });

      const profiles = getCachedProfiles(db, normalizedPubkeys);

      const missingPubkeys = normalizedPubkeys.filter(
        (pubkey) => !profiles.has(pubkey),
      );

      for (const cached of profiles.values()) {
        refreshInBackground(PROFILE_KIND, cached.pubkey);
      }

      const fetchMissing = () =>
        mapWithConcurrency({
          items: missingPubkeys,
          concurrency: PROFILE_CONCURRENCY,
          map: async (pubkey) => {
            await resolveAndCache({
              kind: PROFILE_KIND,
              pubkey,
              refreshMode: 'require-fresh',
            });

            return getCachedProfiles(db, [pubkey]).get(pubkey) ?? null;
          },
        });

      if (!waitForMissing) {
        void fetchMissing().catch((error) =>
          debug(
            `wot-service background profile fetch failed: ${String(error)}`,
          ),
        );

        return profiles;
      }

      const fetchedProfiles = await fetchMissing();

      for (const profile of fetchedProfiles) {
        if (profile) {
          profiles.set(profile.pubkey, profile);
        }
      }

      return profiles;
    },

    async getRelayAuthorMap(pubkeys: string[]): Promise<RelayAuthorGroup[]> {
      const relayToAuthors = new Map<string, Set<string>>();

      const normalizedPubkeys = [
        ...new Set(pubkeys.map((pubkey) => normalizePubkeyInput(pubkey))),
      ];

      await mapWithConcurrency({
        items: normalizedPubkeys,
        concurrency: PROFILE_CONCURRENCY,
        map: (pubkey) => migrateLegacy(RELAY_LIST_KIND, pubkey),
      });

      const cachedEvents = await nostrResolution.getCachedReplaceableEvents({
        kind: RELAY_LIST_KIND,
        pubkeys: normalizedPubkeys,
        identifier: null,
      });

      for (const event of cachedEvents) {
        cacheDerivedEvent(RELAY_LIST_KIND, event);
      }

      for (const pubkey of normalizedPubkeys) {
        const relayList = getCachedRelayList(db, pubkey);

        const writeRelays = relayList?.writeRelays.length
          ? relayList.writeRelays
          : fallbackRelays;

        for (const relay of uniqueRelays(writeRelays)) {
          const authors = relayToAuthors.get(relay) ?? new Set<string>();

          authors.add(pubkey);
          relayToAuthors.set(relay, authors);
        }
      }

      debug(
        `wot-service relay author map: ${normalizedPubkeys.length} authors across ${relayToAuthors.size} relays`,
      );

      return [...relayToAuthors.entries()].map(([relay, authors]) => ({
        relay,
        authors: [...authors],
      }));
    },

    refreshRelayLists,
  };
}
