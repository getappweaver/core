import { describe, expect, test } from 'bun:test';
import type { NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

import { fetchUserWriteRelays, publishEventDetailed } from './relayLists';

describe('relayLists', () => {
  test('fetchUserWriteRelays falls back to provided fallbackRelays when no NIP-65 event is found', async () => {
    // A fake pubkey with no network / non-existent relay
    const relays = await fetchUserWriteRelays({
      pubkey:
        '0000000000000000000000000000000000000000000000000000000000000000',
      fallbackRelays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
    });

    expect(relays).toContain('wss://relay.damus.io/');
    expect(relays).toContain('wss://relay.primal.net/');
  });

  test('fetchUserWriteRelays parses write relays from NIP-65 kind 10002 event', async () => {
    const originalGet = SimplePool.prototype.get;

    SimplePool.prototype.get = async () => ({
      id: 'nip65id',
      pubkey: 'author1',
      kind: 10002,
      created_at: 1000,
      tags: [
        ['r', 'wss://write1.example.com', 'write'],
        ['r', 'wss://read1.example.com', 'read'],
        ['r', 'wss://both.example.com'],
      ],
      content: '',
      sig: 'sig',
    });

    try {
      const relays = await fetchUserWriteRelays({
        pubkey: 'author1',
        fallbackRelays: ['wss://fallback.example.com'],
      });

      expect(relays).toEqual([
        'wss://write1.example.com/',
        'wss://both.example.com/',
      ]);
    } finally {
      SimplePool.prototype.get = originalGet;
    }
  });

  test('publishEventDetailed returns structured outcomes for relays', async () => {
    const fakeEvent: NostrEvent = {
      id: '0000000000000000000000000000000000000000000000000000000000000001',
      pubkey:
        '0000000000000000000000000000000000000000000000000000000000000001',
      kind: 1,
      created_at: 1000,
      tags: [],
      content: 'test',
      sig: '00',
    };

    // Publishing to an invalid localhost port will fail cleanly
    const result = await publishEventDetailed(
      ['ws://127.0.0.1:59999'],
      fakeEvent,
    );

    expect(result.acceptedRelays).toEqual([]);
    expect(result.rejectedRelays.length).toBe(1);
    expect(result.rejectedRelays[0]!.relay).toBe('ws://127.0.0.1:59999/');
    expect(result.outcomes.length).toBe(1);
    expect(result.outcomes[0]!.success).toBe(false);
  });
});
