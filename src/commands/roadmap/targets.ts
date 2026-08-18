import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SimplePool } from 'nostr-tools/pool';

import { uniqueRoadmapRelays } from '@src/commands/roadmap/model';
import {
  resolveNip05Identity,
  type Nip05Identity,
} from '@src/nostr/author-identity';
import { fetchNip65RelaySet } from '@src/nostr/nip65';
import {
  parseNostrRepoAddress,
  repoAddressAuthorNip05,
  repoAddressAuthorNpub,
} from '@src/nostr/repo-address';
import type { RoadmapTarget } from '@src/roadmap/types';

const CORE_ROADMAP_REPO_ADDRESSES = [
  'nostr://_@getappweaver.com/relay.ngit.dev/core',
] as const;

type PluginsJson = {
  plugins?: unknown;
};

type PluginEntry = {
  repo: string;
};

type Nip65RelaySet = {
  readRelays: string[];
  writeRelays: string[];
};

type CachedNip65RelaySetProps = {
  cache: Map<string, Promise<Nip65RelaySet>>;
  pool: SimplePool;
  pubkey: string;
  fallbackRelays: string[];
};

type ResolveRoadmapRepoTargetProps = {
  pool: SimplePool;
  raw: string;
  fallbackRelays: string[];
  nip05Cache: Map<string, Promise<Nip05Identity | null>>;
  nip65Cache: Map<string, Promise<Nip65RelaySet>>;
};

type ResolveRoadmapRepoTargetsProps = {
  pool: SimplePool;
  raws: string[];
  fallbackRelays: string[];
};

function isPluginEntry(value: unknown): value is PluginEntry {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { repo?: unknown }).repo === 'string'
  );
}

function readPluginRepoAddresses(dmBotRoot: string): string[] {
  const pluginsJsonPath = join(dmBotRoot, 'plugins.json');

  if (!existsSync(pluginsJsonPath)) {
    return [];
  }

  const parsed = JSON.parse(
    readFileSync(pluginsJsonPath, 'utf8'),
  ) as PluginsJson;

  return Array.isArray(parsed.plugins)
    ? parsed.plugins.filter(isPluginEntry).map((entry) => entry.repo)
    : [];
}

export function defaultRoadmapRepoAddresses(dmBotRoot: string): string[] {
  return [
    ...CORE_ROADMAP_REPO_ADDRESSES,
    ...readPluginRepoAddresses(dmBotRoot).filter((repo) =>
      repo.startsWith('nostr://'),
    ),
  ];
}

function cachedNip05Identity(
  cache: Map<string, Promise<Nip05Identity | null>>,
  nip05: string,
): Promise<Nip05Identity | null> {
  if (!cache.has(nip05)) {
    cache.set(nip05, resolveNip05Identity(nip05));
  }

  return cache.get(nip05)!;
}

function cachedNip65RelaySet({
  cache,
  pool,
  pubkey,
  fallbackRelays,
}: CachedNip65RelaySetProps): Promise<Nip65RelaySet> {
  if (!cache.has(pubkey)) {
    cache.set(
      pubkey,
      fetchNip65RelaySet({
        pool,
        authorPubkey: pubkey,
        fallbackRelays,
      }),
    );
  }

  return cache.get(pubkey)!;
}

async function resolveRoadmapRepoTarget({
  pool,
  raw,
  fallbackRelays,
  nip05Cache,
  nip65Cache,
}: ResolveRoadmapRepoTargetProps): Promise<RoadmapTarget | null> {
  const parsed = parseNostrRepoAddress(raw);

  if (!parsed) {
    return null;
  }

  const npubPubkey = repoAddressAuthorNpub(parsed.authorHint);
  const nip05 = repoAddressAuthorNip05(parsed.authorHint);

  const identity = npubPubkey
    ? null
    : await cachedNip05Identity(nip05Cache, nip05 ?? '');

  const ownerPubkey = npubPubkey ?? identity?.pubkey ?? '';

  if (!ownerPubkey) {
    return null;
  }

  const discoveryRelays = uniqueRoadmapRelays([
    ...parsed.relayHints,
    ...(identity?.relays ?? []),
    ...fallbackRelays,
  ]);

  const nip65Relays = await cachedNip65RelaySet({
    cache: nip65Cache,
    pool,
    pubkey: ownerPubkey,
    fallbackRelays: discoveryRelays,
  });

  return {
    ownerPubkey,
    repoId: parsed.repoId,
    relayHints: uniqueRoadmapRelays([
      ...discoveryRelays,
      ...nip65Relays.readRelays,
      ...nip65Relays.writeRelays,
    ]),
  };
}

export async function resolveRoadmapRepoTargets({
  pool,
  raws,
  fallbackRelays,
}: ResolveRoadmapRepoTargetsProps): Promise<RoadmapTarget[]> {
  const nip05Cache = new Map<string, Promise<Nip05Identity | null>>();
  const nip65Cache = new Map<string, Promise<Nip65RelaySet>>();

  const targets = await Promise.all(
    raws.map((raw) =>
      resolveRoadmapRepoTarget({
        pool,
        raw,
        fallbackRelays,
        nip05Cache,
        nip65Cache,
      }),
    ),
  );

  return targets.filter((target): target is RoadmapTarget => target !== null);
}
