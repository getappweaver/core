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
    return uniqueRelays(fallbackRelays.length > 0 ? fallbackRelays : relays);
  }

  const { writeRelays } = parseNip65RelayTags(event.tags);

  return writeRelays.length > 0
    ? uniqueRelays(writeRelays)
    : uniqueRelays(fallbackRelays.length > 0 ? fallbackRelays : relays);
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

export type RelayOutcome = {
  relay: string;
  success: boolean;
  reason?: string;
};

export type PublishDetailedResult = {
  acceptedRelays: string[];
  rejectedRelays: Array<{ relay: string; reason: string }>;
  outcomes: RelayOutcome[];
};

export function publishEventDetailed(
  relays: string[],
  event: NostrEvent,
): Promise<PublishDetailedResult> {
  const pool = new SimplePool();
  const normalizedRelays = uniqueRelays(relays);

  return Promise.allSettled(pool.publish(normalizedRelays, event))
    .then((results) => {
      const outcomes: RelayOutcome[] = results.map((result, index) => {
        const relay = normalizedRelays[index];

        if (result.status === 'fulfilled') {
          if (
            typeof result.value === 'string' &&
            result.value.startsWith('connection failure:')
          ) {
            return {
              relay,
              success: false,
              reason: result.value.replace(/^connection failure:\s*/, ''),
            };
          }

          return { relay, success: true };
        }

        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);

        return { relay, success: false, reason };
      });

      const acceptedRelays = outcomes
        .filter((outcome) => outcome.success)
        .map((outcome) => outcome.relay);

      const rejectedRelays = outcomes
        .filter((outcome) => !outcome.success)
        .map((outcome) => ({
          relay: outcome.relay,
          reason: outcome.reason ?? 'failed',
        }));

      return {
        acceptedRelays,
        rejectedRelays,
        outcomes,
      };
    })
    .finally(() => {
      pool.close(normalizedRelays);
    });
}

export async function publishEvent(
  relays: string[],
  event: NostrEvent,
): Promise<string[]> {
  const { acceptedRelays } = await publishEventDetailed(relays, event);

  return acceptedRelays;
}
