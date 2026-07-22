import { describe, expect, test } from 'bun:test';

import {
  MAX_NOSTR_PROFILE_POSTS,
  NostrProfilePostsRequestSchema,
  NostrProfilePostsResponseSchema,
} from './nostr-resolution-schema';

describe('Nostr resolution transport schemas', () => {
  test('normalizes and bounds profile-post requests', () => {
    const parsed = NostrProfilePostsRequestSchema.parse({
      pubkey: 'A'.repeat(64),
      relayHints: ['relay.example'],
      fallbackRelays: [],
      limit: MAX_NOSTR_PROFILE_POSTS,
    });

    expect(parsed.pubkey).toBe('a'.repeat(64));
    expect(parsed.relayHints).toEqual(['wss://relay.example/']);

    expect(() =>
      NostrProfilePostsRequestSchema.parse({
        pubkey: 'a'.repeat(64),
        relayHints: ['https://relay.example'],
        fallbackRelays: [],
        limit: 1,
      }),
    ).toThrow();

    expect(() =>
      NostrProfilePostsRequestSchema.parse({
        pubkey: 'a'.repeat(64),
        relayHints: [],
        fallbackRelays: [],
        limit: MAX_NOSTR_PROFILE_POSTS + 1,
      }),
    ).toThrow();
  });

  test('accepts serializable typed event and address graph edges', () => {
    const event = {
      id: '1'.repeat(64),
      pubkey: '2'.repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: '',
      sig: '3'.repeat(128),
    };

    const response = NostrProfilePostsResponseSchema.parse({
      ok: true,
      primaryEvents: [event],
      graph: {
        events: [event],
        edges: [
          {
            sourceEventId: event.id,
            role: 'embed',
            target: {
              type: 'address',
              kind: 30023,
              pubkey: event.pubkey,
              identifier: 'article',
            },
            relayHints: ['wss://relay.example'],
          },
        ],
        missing: [],
      },
    });

    expect(() => JSON.stringify(response)).not.toThrow();
  });
});
