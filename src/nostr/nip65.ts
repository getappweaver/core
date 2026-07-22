// ---------------------------------------------------------------------------
// src/nostr/nip65.ts — NIP-65 relay lists (kind 10002)
// ---------------------------------------------------------------------------

import type { SimplePool } from 'nostr-tools/pool';

/** Kind 10002 — relay list metadata (NIP-65). */
export const NIP65_RELAY_LIST_KIND = 10002;

/** Kind 10050 — historical relay list used in this app for DM/profile discovery. */
export const DM_RELAY_LIST_KIND = 10050;

/** Relays used to find a pubkey's relay-list events. */
export const PROFILE_RELAYS_FOR_QUERY: readonly string[] = [
  'wss://purplepag.es',
  'wss://relay.nos.social',
  'wss://user.kindpag.es',
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
];

export function normalizeRelay(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const isWebSocketScheme = /^wss?:/i.test(trimmed);
  const isBareHostWithPort = /^[^/:\s]+:\d+(?:[/?#]|$)/.test(trimmed);

  if (hasScheme && !isWebSocketScheme && !isBareHostWithPort) {
    return null;
  }

  const withProtocol = /^wss?:\/\//i.test(trimmed)
    ? trimmed
    : `wss://${trimmed}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
      return null;
    }

    if (url.username || url.password || url.hash) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function uniqueRelays(relays: readonly string[]): string[] {
  return [
    ...new Set(
      relays
        .map((relay) => normalizeRelay(relay))
        .filter((relay): relay is string => relay !== null),
    ),
  ];
}

export function parseNip65RelayTags(tags: string[][]): {
  readRelays: string[];
  writeRelays: string[];
} {
  const relayTags = tags.filter((tag) => tag[0] === 'r' && tag[1]);

  const readRelays = relayTags
    .filter((tag) => tag[2] === 'read' || !tag[2])
    .map((tag) => normalizeRelay(tag[1]))
    .filter((relay): relay is string => relay !== null);

  const writeRelays = relayTags
    .filter((tag) => tag[2] === 'write' || !tag[2])
    .map((tag) => normalizeRelay(tag[1]))
    .filter((relay): relay is string => relay !== null);

  return { readRelays, writeRelays };
}

type FetchNip65WriteRelaysProps = {
  pool: SimplePool;
  authorPubkey: string;
};

type FetchNip65ReadRelaysProps = {
  pool: SimplePool;
  authorPubkey: string;
};

/**
 * Write-capable relays from `authorPubkey`'s kind 10002. Use with `pool.get` when
 * fetching other events (e.g. kind 10063 for `userPubkey`). Falls back to
 * {@link PROFILE_RELAYS_FOR_QUERY} if no event or no `r` tags.
 */
export async function fetchNip65WriteRelays({
  pool,
  authorPubkey,
}: FetchNip65WriteRelaysProps): Promise<string[]> {
  const nip65Event = await pool.get([...PROFILE_RELAYS_FOR_QUERY], {
    kinds: [NIP65_RELAY_LIST_KIND],
    authors: [authorPubkey],
    limit: 1,
  });

  if (!nip65Event) {
    return uniqueRelays(PROFILE_RELAYS_FOR_QUERY);
  }

  const { writeRelays } = parseNip65RelayTags(nip65Event.tags);

  if (writeRelays.length === 0) {
    return uniqueRelays(PROFILE_RELAYS_FOR_QUERY);
  }

  return uniqueRelays(writeRelays);
}

/** Read-capable relays from `authorPubkey`'s kind 10002. Falls back to profile relays. */
export async function fetchNip65ReadRelays({
  pool,
  authorPubkey,
}: FetchNip65ReadRelaysProps): Promise<string[]> {
  const nip65Event = await pool.get([...PROFILE_RELAYS_FOR_QUERY], {
    kinds: [NIP65_RELAY_LIST_KIND],
    authors: [authorPubkey],
    limit: 1,
  });

  if (!nip65Event) {
    return uniqueRelays(PROFILE_RELAYS_FOR_QUERY);
  }

  const { readRelays } = parseNip65RelayTags(nip65Event.tags);

  if (readRelays.length === 0) {
    return uniqueRelays(PROFILE_RELAYS_FOR_QUERY);
  }

  return uniqueRelays(readRelays);
}

type FetchNip65RelaySetProps = {
  pool: SimplePool;
  authorPubkey: string;
  fallbackRelays: string[];
};

export async function fetchNip65RelaySet({
  pool,
  authorPubkey,
  fallbackRelays,
}: FetchNip65RelaySetProps): Promise<{
  readRelays: string[];
  writeRelays: string[];
}> {
  const fallback = [
    ...new Set([
      ...uniqueRelays(PROFILE_RELAYS_FOR_QUERY),
      ...uniqueRelays(fallbackRelays),
    ]),
  ];

  const nip65Event = await pool.get(fallback, {
    kinds: [NIP65_RELAY_LIST_KIND],
    authors: [authorPubkey],
    limit: 1,
  });

  if (!nip65Event) {
    return { readRelays: fallback, writeRelays: fallback };
  }

  const parsed = parseNip65RelayTags(nip65Event.tags);

  return {
    readRelays:
      parsed.readRelays.length > 0 ? uniqueRelays(parsed.readRelays) : fallback,
    writeRelays:
      parsed.writeRelays.length > 0
        ? uniqueRelays(parsed.writeRelays)
        : fallback,
  };
}
