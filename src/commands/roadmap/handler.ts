import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resolveNip05Identity,
  type Nip05Identity,
} from '@src/nostr/author-identity';
import { fetchNip65RelaySet, NIP65_RELAY_LIST_KIND } from '@src/nostr/nip65';
import {
  parseNostrRepoAddress,
  repoAddressAuthorNip05,
  repoAddressAuthorNpub,
} from '@src/nostr/repo-address';

import type { BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import {
  materializeRoadmap,
  ROADMAP_EVENT_KINDS,
  ROADMAP_RELAY_DISCOVERY_RELAYS,
  repoNip65RelaysForProject,
  repoRelaysForProject,
  uniqueRoadmapRelays,
  type IssueView,
  type RoadmapView,
  PROJECT_KIND,
} from './model';
import { renderRoadmapFundWeb, renderRoadmapWeb } from './renderers/web';

const CORE_ROADMAP_REPO_ADDRESSES = [
  'nostr://_@getappweaver.com/relay.ngit.dev/core',
] as const;

function relayArgs(args: string[]): string[] {
  const fallbackRelays = [...ROADMAP_RELAY_DISCOVERY_RELAYS];
  const relayIndex = args.findIndex((arg) => arg === '--relay');

  if (relayIndex >= 0) {
    const relays = uniqueRoadmapRelays((args[relayIndex + 1] ?? '').split(','));

    return relays.length > 0 ? relays : fallbackRelays;
  }

  return fallbackRelays;
}

type ResolvedRoadmapRepoTarget = {
  pubkey: string;
  repoId: string;
  relays: string[];
};

type PluginsJson = {
  plugins?: unknown;
};

type PluginEntry = {
  repo: string;
};

type ResolveRoadmapRepoTargetProps = {
  ctx: Parameters<BuiltinHandler>[0];
  raw: string;
  fallbackRelays: string[];
  nip05Cache: Map<string, Promise<Nip05Identity | null>>;
  nip65Cache: Map<string, Promise<Nip65RelaySet>>;
};

type ResolveRoadmapRepoTargetsProps = {
  ctx: Parameters<BuiltinHandler>[0];
  raws: string[];
  fallbackRelays: string[];
};

type Nip65RelaySet = {
  readRelays: string[];
  writeRelays: string[];
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

function defaultRoadmapRepoAddresses(dmBotRoot: string): string[] {
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

type CachedNip65RelaySetProps = {
  cache: Map<string, Promise<Nip65RelaySet>>;
  ctx: Parameters<BuiltinHandler>[0];
  pubkey: string;
  fallbackRelays: string[];
};

function cachedNip65RelaySet({
  cache,
  ctx,
  pubkey,
  fallbackRelays,
}: CachedNip65RelaySetProps): Promise<Nip65RelaySet> {
  if (!cache.has(pubkey)) {
    cache.set(
      pubkey,
      fetchNip65RelaySet({
        pool: ctx.pool,
        authorPubkey: pubkey,
        fallbackRelays,
      }),
    );
  }

  return cache.get(pubkey)!;
}

async function resolveRoadmapRepoTarget({
  ctx,
  raw,
  fallbackRelays,
  nip05Cache,
  nip65Cache,
}: ResolveRoadmapRepoTargetProps): Promise<ResolvedRoadmapRepoTarget | null> {
  const parsed = parseNostrRepoAddress(raw);

  if (!parsed) {
    return null;
  }

  const npubPubkey = repoAddressAuthorNpub(parsed.authorHint);
  const nip05 = repoAddressAuthorNip05(parsed.authorHint);

  const identity = npubPubkey
    ? null
    : await cachedNip05Identity(nip05Cache, nip05 ?? '');

  const pubkey = npubPubkey ?? identity?.pubkey ?? '';

  if (!pubkey) {
    return null;
  }

  const discoveryRelays = uniqueRoadmapRelays([
    ...parsed.relayHints,
    ...(identity?.relays ?? []),
    ...fallbackRelays,
  ]);

  const nip65Relays = await cachedNip65RelaySet({
    cache: nip65Cache,
    ctx,
    pubkey,
    fallbackRelays: discoveryRelays,
  });

  return {
    pubkey,
    repoId: parsed.repoId,
    relays: uniqueRoadmapRelays([
      ...discoveryRelays,
      ...nip65Relays.readRelays,
      ...nip65Relays.writeRelays,
    ]),
  };
}

async function resolveRoadmapRepoTargets({
  ctx,
  raws,
  fallbackRelays,
}: ResolveRoadmapRepoTargetsProps): Promise<ResolvedRoadmapRepoTarget[]> {
  const nip05Cache = new Map<string, Promise<Nip05Identity | null>>();
  const nip65Cache = new Map<string, Promise<Nip65RelaySet>>();

  const targets = await Promise.all(
    raws.map((raw) =>
      resolveRoadmapRepoTarget({
        ctx,
        raw,
        fallbackRelays,
        nip05Cache,
        nip65Cache,
      }),
    ),
  );

  return targets.filter(
    (target): target is ResolvedRoadmapRepoTarget => target !== null,
  );
}

function uniqueEvents<T extends { id: string }>(events: readonly T[]): T[] {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

function optionArg(args: string[], flag: string): string {
  const index = args.findIndex((arg) => arg === flag);

  if (index < 0) {
    return '';
  }

  return args[index + 1] ?? '';
}

function positionalArg(args: string[], index: number): string {
  return (
    args.filter((arg, idx) => {
      if (arg === '--relay') {
        return false;
      }

      if (arg === '--title' || arg === '--sats') {
        return false;
      }

      if (
        idx > 0 &&
        (args[idx - 1] === '--relay' ||
          args[idx - 1] === '--title' ||
          args[idx - 1] === '--sats')
      ) {
        return false;
      }

      return true;
    })[index] ?? ''
  );
}

function formatSats(value: number): string {
  return `${value.toLocaleString('en-US')} sats`;
}

function roadmapZapReceiptPubkeys(): Set<string> | null {
  const raw = process.env.APPWEAVER_ROADMAP_ZAP_RECEIPT_PUBKEYS?.trim();

  if (!raw) {
    return null;
  }

  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function renderIssue(issue: IssueView): string {
  const status = issue.status ? ` · ${issue.status}` : '';
  const labels = issue.labels.length > 0 ? ` · ${issue.labels.join(', ')}` : '';

  return `- ${issue.subject} (${formatSats(issue.fundingSats)}, ${issue.zapCount} zap${issue.zapCount === 1 ? '' : 's'}, ${issue.commentCount} comment${issue.commentCount === 1 ? '' : 's'}${status}${labels})`;
}

function renderRoadmap(view: RoadmapView): string {
  const lines = [
    `Roadmap (${view.relays.length > 0 ? view.relays.join(', ') : view.relay})`,
    `${view.issueCount} issues · ${view.zapCount} verified zap events`,
  ];

  for (const workflow of view.workflows) {
    lines.push('', workflow.title);

    for (const column of workflow.columns) {
      lines.push(`${column.label}`);

      if (column.issues.length === 0) {
        lines.push('- none');
      } else {
        lines.push(...column.issues.map(renderIssue));
      }
    }
  }

  return lines.join('\n');
}

async function loadRoadmap(ctx: Parameters<BuiltinHandler>[0]) {
  const relays = relayArgs(ctx.args.slice(1));

  const explicitRepoAddress = ctx.args.find((arg) =>
    arg.startsWith('nostr://'),
  );

  const repoAddresses = explicitRepoAddress
    ? [explicitRepoAddress]
    : defaultRoadmapRepoAddresses(ctx.dmBotRoot);

  const repoTargets = await resolveRoadmapRepoTargets({
    ctx,
    raws: repoAddresses,
    fallbackRelays: relays,
  });

  const directRepoEventGroups = await Promise.all(
    repoTargets.map((repoTarget) =>
      ctx.pool.querySync(
        repoTarget.relays,
        {
          kinds: [...ROADMAP_EVENT_KINDS],
          authors: [repoTarget.pubkey],
          '#d': [repoTarget.repoId],
          limit: 500,
        },
        { maxWait: 2_000 },
      ),
    ),
  );

  const directRepoEvents = directRepoEventGroups.flat();

  const bootstrapEvents =
    repoTargets.length > 0
      ? []
      : await ctx.pool.querySync(
          relays,
          {
            kinds: [...ROADMAP_EVENT_KINDS],
            limit: 500,
          },
          { maxWait: 2_000 },
        );

  const relayListsByPubkey = new Map(
    bootstrapEvents
      .filter((event) => event.kind === NIP65_RELAY_LIST_KIND)
      .map((event) => [event.pubkey, event]),
  );

  const repoDiscoveryRelays = uniqueRoadmapRelays(
    repoTargets.length > 0
      ? []
      : bootstrapEvents
          .filter((event) => event.kind === PROJECT_KIND)
          .flatMap((event) =>
            repoNip65RelaysForProject(event, relayListsByPubkey),
          ),
  );

  const repoDiscoveryEvents =
    repoDiscoveryRelays.length > 0
      ? await ctx.pool.querySync(
          repoDiscoveryRelays,
          { kinds: [...ROADMAP_EVENT_KINDS], limit: 500 },
          { maxWait: 2_000 },
        )
      : [];

  const discoveredEvents = uniqueEvents([
    ...directRepoEvents,
    ...bootstrapEvents,
    ...repoDiscoveryEvents,
  ]);

  const relayListsByPubkeyAfterFetch = new Map(
    discoveredEvents
      .filter((event) => event.kind === NIP65_RELAY_LIST_KIND)
      .map((event) => [event.pubkey, event]),
  );

  const repoRelays = uniqueRoadmapRelays(
    discoveredEvents
      .filter((event) => event.kind === PROJECT_KIND)
      .flatMap((event) =>
        repoRelaysForProject(event, relayListsByPubkeyAfterFetch),
      ),
  );

  const repoEvents =
    repoRelays.length > 0
      ? await ctx.pool.querySync(
          repoRelays,
          { kinds: [...ROADMAP_EVENT_KINDS], limit: 500 },
          { maxWait: 2_000 },
        )
      : [];

  const events = uniqueEvents([...discoveredEvents, ...repoEvents]);

  const queriedRelays = uniqueRoadmapRelays([
    ...relays,
    ...repoTargets.flatMap((target) => target.relays),
    ...repoDiscoveryRelays,
    ...repoRelays,
  ]);

  const view = materializeRoadmap({
    relay: repoRelays[0] ?? repoDiscoveryRelays[0] ?? relays[0] ?? '',
    events,
    authorIdentities: null,
    zapReceiptPubkeys: roadmapZapReceiptPubkeys(),
    zapReceiptPubkeysByProjectAddress: null,
  });

  return {
    ...view,
    relays: queriedRelays,
  };
}

async function handleRoadmapList(ctx: Parameters<BuiltinHandler>[0]) {
  const view = await loadRoadmap(ctx);

  if (ctx.source === 'web') {
    return renderRoadmapWeb(view);
  }

  return renderRoadmap(view);
}

async function handleRoadmapBoard(ctx: Parameters<BuiltinHandler>[0]) {
  const target = positionalArg(ctx.args.slice(1), 0);
  const view = await loadRoadmap(ctx);

  const workflow = view.workflows.find(
    (entry) => entry.id === target || entry.key === target,
  );

  if (!workflow) {
    return `Roadmap board not found: ${target || '(missing id)'}`;
  }

  if (ctx.source === 'web') {
    return renderRoadmapWeb({ ...view, mode: 'board', workflows: [workflow] });
  }

  return renderRoadmap({ ...view, workflows: [workflow] });
}

function handleRoadmapFund(ctx: Parameters<BuiltinHandler>[0]) {
  const args = ctx.args.slice(1);
  const issueId = positionalArg(args, 0);
  const title = optionArg(args, '--title') || 'roadmap issue';
  const sats = Number(optionArg(args, '--sats') || 0);
  const relays = relayArgs(args);
  const relay = relays[0] ?? '';

  if (ctx.source === 'web') {
    return renderRoadmapFundWeb({
      issueId,
      title,
      sats: Number.isFinite(sats) ? sats : 0,
      relay,
    });
  }

  return `Fund ${title}: ${formatSats(Number.isFinite(sats) ? sats : 0)} currently verified. Funding execution is not wired yet.`;
}

async function handleRoadmapError(
  fn: () => Promise<Awaited<ReturnType<typeof handleRoadmapList>>>,
) {
  try {
    return await fn();
  } catch (err) {
    return `Failed to read roadmap: ${String(err)}`;
  }
}

export const handleRoadmapRoot: BuiltinHandler = (ctx) => {
  const sub = ctx.args[0]?.toLowerCase() ?? 'list';

  if (sub === 'help') {
    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: ctx.prefix,
        root: 'roadmap',
        topic: ctx.args[1]?.toLowerCase() ?? null,
      }),
    );
  }

  if (sub === 'list') {
    return handleRoadmapError(async () => handleRoadmapList(ctx));
  }

  if (sub === 'board') {
    return handleRoadmapError(async () => handleRoadmapBoard(ctx));
  }

  if (sub === 'fund' || sub === 'zap') {
    return Promise.resolve(handleRoadmapFund(ctx));
  }

  if (sub === 'new' || sub === 'add') {
    const repo = positionalArg(ctx.args.slice(1), 0);

    return Promise.resolve(
      `Roadmap issue creation publishes from the web client with your Nostr signer. Open /roadmap board for repo ${repo || '(missing repo)'}.`,
    );
  }

  return Promise.resolve(
    `Unknown roadmap command: ${sub}. Try ${ctx.prefix}roadmap list`,
  );
};
