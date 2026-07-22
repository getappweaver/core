import { describe, expect, test } from 'bun:test';
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  type Event as NostrEvent,
} from 'nostr-tools';

import type {
  QueryAuthorEventsProps,
  QueryDirectRepliesProps,
  ResolveAuthorRelaySetProps,
  ResolveEventByIdProps,
  ResolveEventGraphProps,
  SeedEventsProps,
} from '@src/nostr/event-resolution-types';
import type { NostrResolutionService } from '@src/nostr/resolution-service';

import { MAX_NOSTR_PROFILE_POSTS_BODY_BYTES } from './nostr-resolution-schema';
import { createWebFetchHandler, type WebRouteContext } from './routes';

type FakeService = {
  service: NostrResolutionService;
  queryCalls: QueryAuthorEventsProps[];
  directReplyCalls: QueryDirectRepliesProps[];
  eventCalls: ResolveEventByIdProps[];
  graphCalls: ResolveEventGraphProps[];
  relaySetCalls: ResolveAuthorRelaySetProps[];
  seedCalls: SeedEventsProps[];
};

function createFakeService(event: NostrEvent): FakeService {
  const queryCalls: QueryAuthorEventsProps[] = [];
  const directReplyCalls: QueryDirectRepliesProps[] = [];
  const eventCalls: ResolveEventByIdProps[] = [];
  const graphCalls: ResolveEventGraphProps[] = [];
  const relaySetCalls: ResolveAuthorRelaySetProps[] = [];
  const seedCalls: SeedEventsProps[] = [];

  const service = {
    resolveEventById: async (props: ResolveEventByIdProps) => {
      eventCalls.push(props);

      return {
        event,
        source: 'cache' as const,
        relayHints: props.relayHints,
        diagnostic: { code: 'cache-hit' as const, attemptedGroups: 0 },
      };
    },
    resolveReplaceableEvent: async () => {
      throw new Error('not implemented');
    },
    queryAuthorEvents: async (props: QueryAuthorEventsProps) => {
      queryCalls.push(props);

      return [event];
    },
    queryDirectReplies: async (props: QueryDirectRepliesProps) => {
      directReplyCalls.push(props);

      return [];
    },
    resolveAuthorRelaySet: async (props: ResolveAuthorRelaySetProps) => {
      relaySetCalls.push(props);

      return {
        readRelays: props.relayHints,
        writeRelays: props.fallbackRelays,
      };
    },
    getCachedReplaceableEvents: async () => {
      return [];
    },
    refreshReplaceableEventsBatch: async () => {
      throw new Error('not implemented');
    },
    resolveGraph: async (props: ResolveEventGraphProps) => {
      graphCalls.push(props);

      return { events: [event], edges: [], missing: [] };
    },
    seedEvents: async (props: SeedEventsProps) => {
      seedCalls.push(props);

      return {
        seeded: props.entries.length,
        skipped: 0,
        invalid: 0,
        results: [],
      };
    },
  } satisfies NostrResolutionService;

  return {
    service,
    queryCalls,
    directReplyCalls,
    eventCalls,
    graphCalls,
    relaySetCalls,
    seedCalls,
  };
}

function context({
  masterPubkey,
  service,
}: {
  masterPubkey: string;
  service: NostrResolutionService | null;
}): WebRouteContext {
  return {
    version: 'test',
    dmBotRoot: '.',
    botRelayUrls: ['wss://context.example/'],
    config: { masterPubkey },
    nostrResolution: service,
  } as WebRouteContext;
}

function authorizationHeader({
  secretKey,
  url,
}: {
  secretKey: Uint8Array;
  url: string;
}): string {
  const event = finalizeEvent(
    {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1_000),
      content: '',
      tags: [
        ['url', url],
        ['method', 'POST'],
      ],
    },
    secretKey,
  );

  return `Nostr ${btoa(JSON.stringify(event))}`;
}

describe('Nostr profile-posts route', () => {
  test('requires NIP-98 authentication when the service is available', async () => {
    const secretKey = generateSecretKey();

    const event = finalizeEvent(
      { kind: 1, created_at: 1, content: '', tags: [] },
      secretKey,
    );

    const fake = createFakeService(event);

    const handler = createWebFetchHandler(
      context({
        masterPubkey: getPublicKey(secretKey),
        service: fake.service,
      }),
    );

    const response = await handler(
      new Request('http://localhost/api/nostr/profile-posts', {
        method: 'POST',
        body: '{}',
      }),
    );

    expect(response.status).toBe(401);
    expect(fake.queryCalls).toHaveLength(0);
  });

  test('returns controlled unavailability in setup mode', async () => {
    const handler = createWebFetchHandler(
      context({ masterPubkey: '', service: null }),
    );

    const response = await handler(
      new Request('http://localhost/api/nostr/profile-posts', {
        method: 'POST',
        body: '{}',
      }),
    );

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error: 'nostr_resolution_unavailable',
    });
  });

  test('uses the injected service with fixed bounded graph policy', async () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);

    const event = finalizeEvent(
      { kind: 1, created_at: 1, content: '', tags: [] },
      secretKey,
    );

    const fake = createFakeService(event);
    const url = 'http://localhost/api/nostr/profile-posts';

    const handler = createWebFetchHandler(
      context({ masterPubkey: pubkey, service: fake.service }),
    );

    const response = await handler(
      new Request(url, {
        method: 'POST',
        headers: {
          Authorization: authorizationHeader({ secretKey, url }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pubkey,
          relayHints: ['relay.example'],
          fallbackRelays: ['fallback.example'],
          limit: 5,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fake.queryCalls).toHaveLength(1);
    expect(fake.graphCalls).toHaveLength(1);
    expect(fake.queryCalls[0]?.refreshMode).toBe('require-fresh');

    expect(fake.queryCalls[0]?.deadlineAtMs).toBe(
      fake.graphCalls[0]?.deadlineAtMs,
    );

    expect(fake.graphCalls[0]?.policy).toMatchObject({
      includeThread: true,
      includeEmbeds: true,
      includeReplies: false,
      maxDepth: 2,
      maxEvents: 50,
      maxReferencesPerEvent: 8,
    });

    expect(await response.json()).toMatchObject({
      ok: true,
      primaryEvents: [{ id: event.id }],
    });
  });

  test('rejects bodies larger than 32 KiB before calling the service', async () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);

    const event = finalizeEvent(
      { kind: 1, created_at: 1, content: '', tags: [] },
      secretKey,
    );

    const fake = createFakeService(event);
    const url = 'http://localhost/api/nostr/profile-posts';

    const handler = createWebFetchHandler(
      context({ masterPubkey: pubkey, service: fake.service }),
    );

    const response = await handler(
      new Request(url, {
        method: 'POST',
        headers: { Authorization: authorizationHeader({ secretKey, url }) },
        body: 'x'.repeat(MAX_NOSTR_PROFILE_POSTS_BODY_BYTES + 1),
      }),
    );

    expect(response.status).toBe(413);
    expect(fake.queryCalls).toHaveLength(0);
  });

  test('seeds raw target events before resolving event context', async () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);

    const event = finalizeEvent(
      { kind: 1, created_at: 1, content: 'visible in UI', tags: [] },
      secretKey,
    );

    const fake = createFakeService(event);
    const url = 'http://localhost/api/nostr/event-context';

    const handler = createWebFetchHandler(
      context({ masterPubkey: pubkey, service: fake.service }),
    );

    const response = await handler(
      new Request(url, {
        method: 'POST',
        headers: {
          Authorization: authorizationHeader({ secretKey, url }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId: event.id,
          authorPubkey: event.pubkey,
          address: null,
          targetEvent: event,
          relayHints: ['relay.example'],
          fallbackRelays: ['fallback.example'],
          includeDirectReplies: true,
          replyLimit: 20,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fake.seedCalls).toHaveLength(1);

    expect(fake.seedCalls[0]?.entries[0]?.event).toMatchObject({
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
    });

    expect(fake.eventCalls).toHaveLength(1);
    expect(fake.directReplyCalls).toHaveLength(1);

    expect(await response.json()).toMatchObject({
      ok: true,
      targetEvent: { id: event.id },
    });
  });
});
