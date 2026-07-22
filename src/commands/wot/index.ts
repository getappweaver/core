import { nip19 } from 'nostr-tools';
import type { SimplePool } from 'nostr-tools/pool';

import type { CoreDb } from '@src/db';
import {
  getWotRootStats,
  getWotScoreDetails,
  upsertCachedProfile,
} from '@src/db';
import type { BotConfig } from '@src/env';
import { PROFILE_RELAYS_FOR_QUERY, uniqueRelays } from '@src/nostr/nip65';
import type { NostrResolutionService } from '@src/nostr/resolution-service';
import { crawlWot, normalizePubkeyInput } from '@src/nostr/wot';

function getWotUsage(): string {
  return 'Usage: !wot crawl [--pubkey <pubkey|npub>] [--depth <n>] | !wot score <pubkey|npub> [of <pubkey|npub>] | !wot stats [<pubkey|npub>] | !wot fetch-profile <npub|nprofile|hex>';
}

type ProfileTarget = {
  pubkey: string;
  relayHints: string[];
};

type ProfileMetadata = {
  name: string | null;
  displayName: string | null;
  picture: string | null;
  about: string | null;
};

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseWotCrawlArgs(
  args: string[],
  defaultRootPubkey: string,
): {
  rootPubkey: string;
  maxDepth: number;
} {
  let rootPubkey = defaultRootPubkey;
  let maxDepth = 2;
  let index = 1;

  while (index < args.length) {
    const arg = args[index]?.toLowerCase();

    if (arg === '--pubkey') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('Missing value for --pubkey.');
      }

      rootPubkey = normalizePubkeyInput(value);
      index += 2;

      continue;
    }

    if (arg === '--depth') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('Missing value for --depth.');
      }

      maxDepth = parsePositiveInt(value, '--depth');
      index += 2;

      continue;
    }

    throw new Error(`Unknown crawl option: ${args[index]}`);
  }

  return {
    rootPubkey: normalizePubkeyInput(rootPubkey),
    maxDepth,
  };
}

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

function parseProfileTarget(input: string): ProfileTarget {
  const trimmed = input.trim();

  try {
    const decoded = nip19.decode(trimmed);

    if (decoded.type === 'nprofile') {
      return {
        pubkey: decoded.data.pubkey.toLowerCase(),
        relayHints: decoded.data.relays ?? [],
      };
    }

    if (decoded.type === 'npub') {
      return { pubkey: decoded.data.toLowerCase(), relayHints: [] };
    }
  } catch {
    // Fall through to existing hex/npub parser for consistent errors.
  }

  return { pubkey: normalizePubkeyInput(trimmed), relayHints: [] };
}

function parseWotFetchProfileArgs(args: string[]): ProfileTarget {
  const profileIndex = args.findIndex((arg) => arg === '--profile');
  const value = profileIndex >= 0 ? args[profileIndex + 1] : args[1];

  if (!value) {
    throw new Error(
      'Missing profile. Use: wot fetch-profile <npub|nprofile|hex>',
    );
  }

  return parseProfileTarget(value);
}

export type HandleWotProps = {
  db: CoreDb;
  pool: SimplePool;
  nostrResolution: NostrResolutionService;
  config: BotConfig;
  args: string[];
};

export async function handleWot({
  db,
  pool,
  nostrResolution,
  config,
  args,
}: HandleWotProps): Promise<string> {
  const subcmd = args[0]?.toLowerCase();

  if (!subcmd) {
    return getWotUsage();
  }

  if (subcmd === 'score') {
    const targetArg = args[1];

    if (!targetArg) {
      return getWotUsage();
    }

    const targetPubkey = normalizePubkeyInput(targetArg);

    const ofIndex = args.findIndex(
      (arg, index) => index >= 2 && arg.toLowerCase() === 'of',
    );

    const rootArg = ofIndex >= 0 ? args[ofIndex + 1] : undefined;
    const rootPubkey = normalizePubkeyInput(rootArg ?? config.masterPubkey);
    const details = getWotScoreDetails(db, targetPubkey, rootPubkey);

    if (!details) {
      return `No WoT entry for ${targetPubkey} under root ${rootPubkey}. Crawl it first with !wot crawl${rootArg ? ` ${rootPubkey}` : ''}.`;
    }

    const scoreLine =
      details.score === null
        ? 'Score: n/a (root node)'
        : `Score: ${details.score.toFixed(2)} / 100`;

    const baseScoreLine =
      details.base_score === null
        ? 'Base score: n/a'
        : `Base score: ${details.base_score.toFixed(2)} / 100`;

    return `WoT score for ${details.pubkey}
Root: ${details.root_pubkey}
Level: ${details.depth}
${baseScoreLine}
Followers in WoT: ${details.follower_count}
Weighted support: ${details.weighted_support.toFixed(3)}
Normalized support: ${details.normalized_support.toFixed(3)}
Following count: ${details.following_count}
${scoreLine}

Support can come from all crawled circles; closer supporters count more.`;
  }

  if (subcmd === 'stats') {
    const rootPubkey = normalizePubkeyInput(args[1] ?? config.masterPubkey);
    const stats = getWotRootStats(db, rootPubkey);

    if (!stats) {
      return `No WoT data for ${rootPubkey}. Crawl it first with !wot crawl${args[1] ? ` ${rootPubkey}` : ''}.`;
    }

    return `WoT stats for ${stats.root_pubkey}
Nodes: ${stats.node_count}
Edges: ${stats.edge_count}
Max depth: ${stats.max_depth}
Last fetched at: ${stats.last_fetched_at}`;
  }

  if (subcmd === 'fetch-profile') {
    const target = parseWotFetchProfileArgs(args);

    const relays = uniqueRelays([
      ...PROFILE_RELAYS_FOR_QUERY,
      ...target.relayHints,
      ...config.botRelayUrls,
    ]);

    const resolved = await nostrResolution.resolveReplaceableEvent({
      kind: 0,
      pubkey: target.pubkey,
      identifier: null,
      relayHints: target.relayHints,
      contextRelays: config.botRelayUrls,
      fallbackRelays: PROFILE_RELAYS_FOR_QUERY as string[],
      refreshMode: 'require-fresh',
      refreshIntervalMs: 15 * 60 * 1_000,
      deadlineAtMs: Date.now() + 8_000,
    });

    const latest = resolved.event;

    if (!latest) {
      return `No kind 0 profile found for ${target.pubkey}.
Relays queried: ${relays.join(', ')}`;
    }

    const metadata = parseProfileMetadata(latest.content);

    const cached = upsertCachedProfile({
      db,
      pubkey: latest.pubkey,
      eventId: latest.id,
      createdAt: latest.created_at,
      name: metadata.name,
      displayName: metadata.displayName,
      picture: metadata.picture,
      about: metadata.about,
      rawJson: '',
    });

    const display = metadata.displayName ?? metadata.name ?? '(unnamed)';

    return `Fetched profile: ${display}
Pubkey: ${cached.pubkey}
Event: ${cached.eventId}
Created at: ${new Date(cached.createdAt * 1000).toISOString()}
Relays queried: ${relays.join(', ')}`;
  }

  if (subcmd !== 'crawl') {
    return getWotUsage();
  }

  const { rootPubkey, maxDepth } = parseWotCrawlArgs(args, config.masterPubkey);

  await crawlWot({
    pool,
    db,
    nostrResolution,
    rootPubkey,
    maxDepth,
  });

  const stats = getWotRootStats(db, rootPubkey);

  if (!stats) {
    return `WoT crawl finished for ${rootPubkey}, but no graph data was stored.`;
  }

  return `WoT crawl finished for ${rootPubkey}.
Nodes: ${stats.node_count}
Edges: ${stats.edge_count}
Max depth: ${stats.max_depth}
Last fetched at: ${stats.last_fetched_at}`;
}
