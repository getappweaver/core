import type { Event } from 'nostr-tools/core';
import type { SimplePool } from 'nostr-tools/pool';

import type {
  CachedContactList,
  CachedProfile,
  CachedRelayList,
  CoreDb,
} from '@src/db';
import {
  getCachedContactList,
  getCachedProfiles,
  getCachedRelayList,
  getWotScore,
  upsertCachedContactList,
  upsertCachedProfile,
  upsertCachedRelayList,
} from '@src/db';
import { debug } from '@src/logger';

import {
  parseNip65RelayTags,
  PROFILE_RELAYS_FOR_QUERY,
  uniqueRelays,
} from './nip65';
import { normalizePubkeyInput, parseFollowList } from './wot';

const CONTACT_LIST_KIND = 3;
const PROFILE_KIND = 0;
const RELAY_LIST_KIND = 10002;
const DEFAULT_MAX_WAIT_MS = 4_000;

type CountCapablePool = SimplePool & {
  count?: (
    relays: string[],
    filters: Record<string, unknown>,
    opts?: { maxWait?: number },
  ) => Promise<number | { count: number }>;
};

export type RelayAuthorGroup = {
  relay: string;
  authors: string[];
};

export type WotServices = {
  getWotScore: (pubkey: string, rootPubkey?: string) => number | null;
  getFollows: (pubkey: string) => Promise<string[]>;
  getProfiles: (pubkeys: string[]) => Promise<Map<string, CachedProfile>>;
  getRelayList: (pubkey: string) => Promise<CachedRelayList | null>;
  getRelayAuthorMap: (pubkeys: string[]) => Promise<RelayAuthorGroup[]>;
};

type ProfileMetadata = {
  name: string | null;
  displayName: string | null;
  picture: string | null;
  about: string | null;
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

async function countNewerReplaceable({
  pool,
  relays,
  pubkey,
  kind,
  since,
}: {
  pool: SimplePool;
  relays: string[];
  pubkey: string;
  kind: number;
  since: number;
}): Promise<number | null> {
  const count = (pool as CountCapablePool).count;

  if (!count) {
    return null;
  }

  try {
    const result = await count(
      relays,
      { authors: [pubkey], kinds: [kind], since, limit: 1 },
      { maxWait: 2_000 },
    );

    return typeof result === 'number' ? result : result.count;
  } catch (err) {
    debug(`wot-service count failed for kind ${kind}: ${String(err)}`);

    return null;
  }
}

async function fetchLatestReplaceable({
  pool,
  relays,
  pubkey,
  kind,
}: {
  pool: SimplePool;
  relays: string[];
  pubkey: string;
  kind: number;
}): Promise<Event | null> {
  try {
    const events = await pool.querySync(
      relays,
      { authors: [pubkey], kinds: [kind], limit: 1 },
      { maxWait: DEFAULT_MAX_WAIT_MS },
    );

    return events.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
  } catch (err) {
    debug(`wot-service fetch failed for kind ${kind}: ${String(err)}`);

    return null;
  }
}

function backgroundCheckAndUpdateContactList({
  db,
  pool,
  relays,
  cached,
}: {
  db: CoreDb;
  pool: SimplePool;
  relays: string[];
  cached: CachedContactList;
}): void {
  void (async () => {
    const newerCount = await countNewerReplaceable({
      pool,
      relays,
      pubkey: cached.pubkey,
      kind: CONTACT_LIST_KIND,
      since: cached.createdAt + 1,
    });

    if (newerCount === 0) {
      debug(`wot-service follows cache current for ${cached.pubkey}`);

      return;
    }

    const latest = await fetchLatestReplaceable({
      pool,
      relays,
      pubkey: cached.pubkey,
      kind: CONTACT_LIST_KIND,
    });

    if (!latest || latest.created_at <= cached.createdAt) {
      return;
    }

    const follows = parseFollowList(latest).map((follow) => follow.pubkey);

    upsertCachedContactList({
      db,
      pubkey: latest.pubkey,
      eventId: latest.id,
      createdAt: latest.created_at,
      follows,
      rawJson: JSON.stringify(latest),
    });

    debug(
      `wot-service updated follows cache for ${latest.pubkey}: ${follows.length}`,
    );
  })();
}

function backgroundCheckAndUpdateRelayList({
  db,
  pool,
  relays,
  cached,
}: {
  db: CoreDb;
  pool: SimplePool;
  relays: string[];
  cached: CachedRelayList;
}): void {
  void (async () => {
    const newerCount = await countNewerReplaceable({
      pool,
      relays,
      pubkey: cached.pubkey,
      kind: RELAY_LIST_KIND,
      since: cached.createdAt + 1,
    });

    if (newerCount === 0) {
      debug(`wot-service relay cache current for ${cached.pubkey}`);

      return;
    }

    const latest = await fetchLatestReplaceable({
      pool,
      relays,
      pubkey: cached.pubkey,
      kind: RELAY_LIST_KIND,
    });

    if (!latest || latest.created_at <= cached.createdAt) {
      return;
    }

    const parsed = parseNip65RelayTags(latest.tags);

    upsertCachedRelayList({
      db,
      pubkey: latest.pubkey,
      eventId: latest.id,
      createdAt: latest.created_at,
      readRelays: parsed.readRelays,
      writeRelays: parsed.writeRelays,
      rawJson: JSON.stringify(latest),
    });

    debug(
      `wot-service updated relay cache for ${latest.pubkey}: ${parsed.writeRelays.length} write relays`,
    );
  })();
}

function backgroundCheckAndUpdateProfile({
  db,
  pool,
  relays,
  cached,
}: {
  db: CoreDb;
  pool: SimplePool;
  relays: string[];
  cached: CachedProfile;
}): void {
  void (async () => {
    const newerCount = await countNewerReplaceable({
      pool,
      relays,
      pubkey: cached.pubkey,
      kind: PROFILE_KIND,
      since: cached.createdAt + 1,
    });

    if (newerCount === 0) {
      debug(`wot-service profile cache current for ${cached.pubkey}`);

      return;
    }

    const latest = await fetchLatestReplaceable({
      pool,
      relays,
      pubkey: cached.pubkey,
      kind: PROFILE_KIND,
    });

    if (!latest || latest.created_at <= cached.createdAt) {
      return;
    }

    const metadata = parseProfileMetadata(latest.content);

    upsertCachedProfile({
      db,
      pubkey: latest.pubkey,
      eventId: latest.id,
      createdAt: latest.created_at,
      name: metadata.name,
      displayName: metadata.displayName,
      picture: metadata.picture,
      about: metadata.about,
      rawJson: JSON.stringify(latest),
    });

    debug(`wot-service updated profile cache for ${latest.pubkey}`);
  })();
}

export function createWotServices({
  db,
  pool,
  rootPubkey,
  fallbackRelays,
}: {
  db: CoreDb;
  pool: SimplePool;
  rootPubkey: string;
  fallbackRelays: string[];
}): WotServices {
  const relays = uniqueRelays([...PROFILE_RELAYS_FOR_QUERY, ...fallbackRelays]);

  async function fetchAndCacheFollows(
    pubkey: string,
  ): Promise<CachedContactList | null> {
    const latest = await fetchLatestReplaceable({
      pool,
      relays,
      pubkey,
      kind: CONTACT_LIST_KIND,
    });

    if (!latest) {
      debug(`wot-service no follows found for ${pubkey}`);

      return null;
    }

    const follows = parseFollowList(latest).map((follow) => follow.pubkey);

    return upsertCachedContactList({
      db,
      pubkey: latest.pubkey,
      eventId: latest.id,
      createdAt: latest.created_at,
      follows,
      rawJson: JSON.stringify(latest),
    });
  }

  async function fetchAndCacheRelayList(
    pubkey: string,
  ): Promise<CachedRelayList | null> {
    const latest = await fetchLatestReplaceable({
      pool,
      relays,
      pubkey,
      kind: RELAY_LIST_KIND,
    });

    if (!latest) {
      debug(`wot-service no relay list found for ${pubkey}`);

      return null;
    }

    const parsed = parseNip65RelayTags(latest.tags);

    return upsertCachedRelayList({
      db,
      pubkey: latest.pubkey,
      eventId: latest.id,
      createdAt: latest.created_at,
      readRelays: parsed.readRelays,
      writeRelays: parsed.writeRelays,
      rawJson: JSON.stringify(latest),
    });
  }

  async function fetchAndCacheProfile(
    pubkey: string,
  ): Promise<CachedProfile | null> {
    const latest = await fetchLatestReplaceable({
      pool,
      relays,
      pubkey,
      kind: PROFILE_KIND,
    });

    if (!latest) {
      debug(`wot-service no profile found for ${pubkey}`);

      return null;
    }

    const metadata = parseProfileMetadata(latest.content);

    return upsertCachedProfile({
      db,
      pubkey: latest.pubkey,
      eventId: latest.id,
      createdAt: latest.created_at,
      name: metadata.name,
      displayName: metadata.displayName,
      picture: metadata.picture,
      about: metadata.about,
      rawJson: JSON.stringify(latest),
    });
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

    async getFollows(pubkey: string): Promise<string[]> {
      const normalizedPubkey = normalizePubkeyInput(pubkey);
      const cached = getCachedContactList(db, normalizedPubkey);

      if (cached) {
        backgroundCheckAndUpdateContactList({ db, pool, relays, cached });

        return cached.follows;
      }

      return (await fetchAndCacheFollows(normalizedPubkey))?.follows ?? [];
    },

    async getRelayList(pubkey: string): Promise<CachedRelayList | null> {
      const normalizedPubkey = normalizePubkeyInput(pubkey);
      const cached = getCachedRelayList(db, normalizedPubkey);

      if (cached) {
        backgroundCheckAndUpdateRelayList({ db, pool, relays, cached });

        return cached;
      }

      return await fetchAndCacheRelayList(normalizedPubkey);
    },

    async getProfiles(pubkeys: string[]): Promise<Map<string, CachedProfile>> {
      const normalizedPubkeys = [
        ...new Set(
          pubkeys
            .map((pubkey) => normalizePubkeyInput(pubkey))
            .filter((pubkey): pubkey is string => pubkey !== null),
        ),
      ];

      const profiles = getCachedProfiles(db, normalizedPubkeys);

      const missingPubkeys = normalizedPubkeys.filter(
        (pubkey) => !profiles.has(pubkey),
      );

      for (const cached of profiles.values()) {
        backgroundCheckAndUpdateProfile({ db, pool, relays, cached });
      }

      const fetchedProfiles = await Promise.all(
        missingPubkeys.map((pubkey) => fetchAndCacheProfile(pubkey)),
      );

      for (const profile of fetchedProfiles) {
        if (profile) {
          profiles.set(profile.pubkey, profile);
        }
      }

      return profiles;
    },

    async getRelayAuthorMap(pubkeys: string[]): Promise<RelayAuthorGroup[]> {
      const relayToAuthors = new Map<string, Set<string>>();

      await Promise.all(
        pubkeys.map(async (pubkey) => {
          const relayList = await this.getRelayList(pubkey);

          const writeRelays = relayList?.writeRelays.length
            ? relayList.writeRelays
            : fallbackRelays;

          for (const relay of uniqueRelays(writeRelays)) {
            const authors = relayToAuthors.get(relay) ?? new Set<string>();
            authors.add(pubkey);
            relayToAuthors.set(relay, authors);
          }
        }),
      );

      debug(
        `wot-service relay author map: ${pubkeys.length} authors across ${relayToAuthors.size} relays`,
      );

      return [...relayToAuthors.entries()].map(([relay, authors]) => ({
        relay,
        authors: [...authors],
      }));
    },
  };
}
