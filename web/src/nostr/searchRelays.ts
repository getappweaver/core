import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

const NIP65_KIND = 10002;
const SEARCH_RELAYS_KIND = 10007;

export const SEARCH_RELAY_DISCOVERY_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.nos.social',
  'wss://user.kindpag.es',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

export type SearchRelaysState = {
  relays: string[];
  private: boolean;
  event: NostrEvent | null;
  encryptedRelaysLoaded: boolean;
};

type LoadSearchRelaysProps = {
  pubkey: string;
  decryptSelf: (ciphertext: string) => Promise<string | null>;
};

type SaveSearchRelaysProps = {
  pubkey: string;
  relays: string[];
  private: boolean;
  encryptSelf: (plaintext: string) => Promise<string | null>;
  signEvent: (
    event: EventTemplate,
    options?: { title: string | null },
  ) => Promise<NostrEvent | null>;
};

function normalizeRelay(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
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

    url.protocol = 'wss:';

    return url.toString();
  } catch {
    return null;
  }
}

function relayTags(event: NostrEvent): string[] {
  return event.tags
    .filter((tag) => tag[0] === 'relay' && typeof tag[1] === 'string')
    .map((tag) => normalizeRelay(tag[1]!))
    .filter((relay): relay is string => relay !== null);
}

function uniqueRelays(relays: string[]): string[] {
  return [...new Set(relays.map(normalizeRelay).filter(Boolean) as string[])];
}

async function decryptRelayTags(props: {
  content: string;
  decryptSelf: (ciphertext: string) => Promise<string | null>;
}): Promise<string[]> {
  if (props.content.trim().length === 0) {
    return [];
  }

  const plaintext = await props.decryptSelf(props.content);

  if (!plaintext) {
    return [];
  }

  const parsed = JSON.parse(plaintext) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(
      (tag): tag is string[] =>
        Array.isArray(tag) && tag[0] === 'relay' && typeof tag[1] === 'string',
    )
    .map((tag) => normalizeRelay(tag[1]!))
    .filter((relay): relay is string => relay !== null);
}

async function fetchUserWriteRelays(pubkey: string): Promise<string[]> {
  const pool = new SimplePool();

  try {
    const event = await pool.get(SEARCH_RELAY_DISCOVERY_RELAYS, {
      kinds: [NIP65_KIND],
      authors: [pubkey],
      limit: 1,
    });

    if (!event) {
      return SEARCH_RELAY_DISCOVERY_RELAYS;
    }

    const writeRelays = event.tags
      .filter((tag) => tag[0] === 'r' && typeof tag[1] === 'string')
      .filter((tag) => tag[2] === undefined || tag[2] === 'write')
      .map((tag) => normalizeRelay(tag[1]!))
      .filter((relay): relay is string => relay !== null);

    return writeRelays.length > 0
      ? [...new Set(writeRelays)]
      : SEARCH_RELAY_DISCOVERY_RELAYS;
  } finally {
    pool.close(SEARCH_RELAY_DISCOVERY_RELAYS);
  }
}

export async function loadSearchRelays({
  pubkey,
  decryptSelf,
}: LoadSearchRelaysProps): Promise<SearchRelaysState> {
  const pool = new SimplePool();

  try {
    const event = await pool.get(SEARCH_RELAY_DISCOVERY_RELAYS, {
      kinds: [SEARCH_RELAYS_KIND],
      authors: [pubkey],
      limit: 1,
    });

    if (!event) {
      return {
        relays: [],
        private: false,
        event: null,
        encryptedRelaysLoaded: false,
      };
    }

    const publicRelays = relayTags(event);

    const privateRelays = await decryptRelayTags({
      content: event.content,
      decryptSelf,
    });

    return {
      relays: uniqueRelays([...publicRelays, ...privateRelays]),
      private: event.content.trim().length > 0 && publicRelays.length === 0,
      event,
      encryptedRelaysLoaded: privateRelays.length > 0,
    };
  } finally {
    pool.close(SEARCH_RELAY_DISCOVERY_RELAYS);
  }
}

export async function saveSearchRelays({
  pubkey,
  relays,
  private: privateList,
  encryptSelf,
  signEvent,
}: SaveSearchRelaysProps): Promise<string[]> {
  const normalizedRelays = uniqueRelays(relays);
  const relayTagList = normalizedRelays.map((relay) => ['relay', relay]);

  const content = privateList
    ? await encryptSelf(JSON.stringify(relayTagList))
    : '';

  if (privateList && content === null) {
    throw new Error('Current signer does not support NIP-44 self-encryption.');
  }

  const event = await signEvent(
    {
      kind: SEARCH_RELAYS_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: privateList
        ? [['alt', 'Relay list to use for Search']]
        : [...relayTagList, ['alt', 'Relay list to use for Search']],
      content: content ?? '',
    },
    { title: 'Sign Event: Save search relays' },
  );

  if (!event) {
    throw new Error('Signing was cancelled.');
  }

  const publishRelays = await fetchUserWriteRelays(pubkey);
  const pool = new SimplePool();

  try {
    const results = await Promise.allSettled(
      pool.publish(publishRelays, event),
    );

    const acceptedRelays = results
      .map((result, index) =>
        result.status === 'fulfilled' ? publishRelays[index] : null,
      )
      .filter((relay): relay is string => relay !== null);

    if (acceptedRelays.length === 0) {
      throw new Error('Publish failed on all write relays.');
    }

    return acceptedRelays;
  } finally {
    pool.close(publishRelays);
  }
}
