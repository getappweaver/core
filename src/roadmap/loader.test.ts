import { expect, test } from 'bun:test';
import type { NostrEvent } from 'nostr-tools';
import type { SimplePool } from 'nostr-tools/pool';

import {
  ISSUE_KIND,
  PROJECT_KIND,
  ZAP_KIND,
} from '@src/commands/roadmap/model';
import { NIP65_RELAY_LIST_KIND } from '@src/nostr/nip65';

import { loadRoadmapSnapshot } from './loader';

const ownerPubkey = 'a'.repeat(64);
const projectAddress = `${PROJECT_KIND}:${ownerPubkey}:core`;

function event(id: string, kind: number, tags: string[][]): NostrEvent {
  return {
    id: id.repeat(64).slice(0, 64),
    pubkey: ownerPubkey,
    created_at: 1,
    kind,
    tags,
    content: '',
    sig: 'f'.repeat(128),
  };
}

test('loads zap receipts from the repository owner read relays', async () => {
  const project = event('1', PROJECT_KIND, [
    ['d', 'core'],
    ['relays', 'wss://repo.example'],
  ]);

  const relayList = event('2', NIP65_RELAY_LIST_KIND, [
    ['r', 'wss://owner-inbox.example', 'read'],
    ['r', 'wss://owner-outbox.example', 'write'],
  ]);

  const issue = event('3', ISSUE_KIND, [['a', projectAddress]]);
  const queries: { relays: string[]; kinds: number[] }[] = [];

  const pool = {
    async querySync(relays: string[], filter: { kinds?: number[] }) {
      const kinds = filter.kinds ?? [];

      queries.push({ relays, kinds });

      if (kinds.includes(PROJECT_KIND)) {
        return [project];
      }

      if (kinds.includes(NIP65_RELAY_LIST_KIND)) {
        return [relayList];
      }

      if (kinds.includes(ISSUE_KIND)) {
        return [issue];
      }

      return [];
    },
  } as unknown as SimplePool;

  await loadRoadmapSnapshot({
    target: {
      ownerPubkey,
      repoId: 'core',
      relayHints: ['wss://relay.ngit.dev'],
    },
    boardKey: null,
    pool,
  });

  const zapQuery = queries.find((query) => query.kinds.includes(ZAP_KIND));

  expect(zapQuery?.relays).toContain('wss://owner-inbox.example/');
  expect(zapQuery?.relays).not.toContain('wss://owner-outbox.example/');
  expect(zapQuery?.relays).toContain('wss://repo.example/');
  expect(zapQuery?.relays).toContain('wss://relay.ngit.dev/');
});
