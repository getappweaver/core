import type { NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

import {
  NIP65_RELAY_LIST_KIND,
  PROFILE_RELAYS_FOR_QUERY,
  parseNip65RelayTags,
  uniqueRelays,
} from '@src/nostr/nip65';

type FetchRelayListProps = {
  pubkey: string;
  relays: string[];
};

export async function fetchRelayList({
  pubkey,
  relays,
}: FetchRelayListProps): Promise<NostrEvent | null> {
  const pool = new SimplePool();
  const normalizedRelays = uniqueRelays(relays);

  try {
    return await pool.get(normalizedRelays, {
      kinds: [NIP65_RELAY_LIST_KIND],
      authors: [pubkey],
      limit: 1,
    });
  } finally {
    pool.close(normalizedRelays);
  }
}

export async function fetchUserWriteRelays({
  pubkey,
  fallbackRelays,
}: {
  pubkey: string;
  fallbackRelays: string[];
}): Promise<string[]> {
  const relays = uniqueRelays([...PROFILE_RELAYS_FOR_QUERY, ...fallbackRelays]);
  const event = await fetchRelayList({ pubkey, relays });

  if (!event) {
    return relays;
  }

  const { writeRelays } = parseNip65RelayTags(event.tags);

  return writeRelays.length > 0 ? uniqueRelays(writeRelays) : relays;
}

export async function fetchAuthorReadRelays({
  pubkey,
  relayHints,
  fallbackRelays,
}: {
  pubkey: string;
  relayHints: string[];
  fallbackRelays: string[];
}): Promise<string[]> {
  const relays = uniqueRelays([
    ...PROFILE_RELAYS_FOR_QUERY,
    ...relayHints,
    ...fallbackRelays,
  ]);

  const event = await fetchRelayList({ pubkey, relays });

  if (!event) {
    return relays;
  }

  const { readRelays } = parseNip65RelayTags(event.tags);

  return readRelays.length > 0 ? uniqueRelays(readRelays) : relays;
}

export function publishEvent(
  relays: string[],
  event: NostrEvent,
): Promise<string[]> {
  const pool = new SimplePool();
  const normalizedRelays = uniqueRelays(relays);

  return Promise.allSettled(pool.publish(normalizedRelays, event))
    .then((results) =>
      results
        .map((result, index) =>
          result.status === 'fulfilled' ? normalizedRelays[index] : null,
        )
        .filter((relay): relay is string => relay !== null),
    )
    .finally(() => {
      pool.close(normalizedRelays);
    });
}
