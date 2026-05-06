import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import type { NostrEvent } from 'nostr-tools';

import type { RouteCommandContext } from '../../dispatch';

import { renderPluginsInstallText } from './renderers/text';
import { renderPluginsInstallWeb } from './renderers/web';

const PLUGIN_KIND = 32107;

const PLUGIN_QUERY_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://nostr.mom',
];

type RefEntry = {
  tag: string;
  coreMajor: string;
  changelog: string;
};

export type PluginCatalogEntry = {
  id: string;
  createdAt: number;
  pubkey: string;
  name: string;
  description: string;
  version: string;
  coreApiVersion: string;
  repo: string;
  refs: RefEntry[];
  installedAlias: string | null;
  installedVersion: string | null;
  compatibleRef: RefEntry | null;
  latestRef: RefEntry | null;
};

type InstalledPluginEntry = {
  alias: string;
  repo: string;
  version: string;
};

type PluginsJson = {
  plugins: InstalledPluginEntry[];
};

export type PluginsInstallRepresentation = {
  coreMajor: string;
  relays: string[];
  entries: PluginCatalogEntry[];
};

function tagValue(tags: string[][], name: string): string {
  return tags.find((tag) => tag[0] === name)?.[1] ?? '';
}

function parsePluginEvent(event: NostrEvent): PluginCatalogEntry | null {
  const name = tagValue(event.tags, 'd');
  const repo = tagValue(event.tags, 'repo');

  if (!name || !repo) {
    return null;
  }

  const refs = event.tags
    .filter((tag) => tag[0] === 'ref' && tag[1] && tag[2] && tag[3])
    .map((tag) => ({
      tag: tag[1],
      coreMajor: tag[2],
      changelog: tag[3],
    }));

  return {
    id: event.id,
    createdAt: event.created_at,
    pubkey: event.pubkey,
    name,
    description: event.content,
    version: tagValue(event.tags, 'version'),
    coreApiVersion: tagValue(event.tags, 'coreApiVersion'),
    repo,
    refs,
    installedAlias: null,
    installedVersion: null,
    compatibleRef: null,
    latestRef: refs.at(-1) ?? null,
  };
}

function readCoreMajor(dmBotRoot: string): string {
  const pkgPath = join(dmBotRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

  return pkg.version.split('.')[0] ?? '0';
}

function readInstalledPlugins(dmBotRoot: string): InstalledPluginEntry[] {
  const pluginsJsonPath = join(dmBotRoot, 'plugins.json');

  if (!existsSync(pluginsJsonPath)) {
    return [];
  }

  const parsed = JSON.parse(
    readFileSync(pluginsJsonPath, 'utf8'),
  ) as PluginsJson;

  if (!Array.isArray(parsed.plugins)) {
    return [];
  }

  return parsed.plugins.filter((entry): entry is InstalledPluginEntry => {
    return (
      entry !== null &&
      typeof entry === 'object' &&
      typeof entry.alias === 'string' &&
      typeof entry.repo === 'string' &&
      typeof entry.version === 'string'
    );
  });
}

function latestCompatibleRef(
  refs: RefEntry[],
  coreMajor: string,
): RefEntry | null {
  return refs.filter((ref) => ref.coreMajor === coreMajor).at(-1) ?? null;
}

type AttachInstalledStateProps = {
  entries: PluginCatalogEntry[];
  installedPlugins: InstalledPluginEntry[];
  coreMajor: string;
};

function attachInstalledState({
  entries,
  installedPlugins,
  coreMajor,
}: AttachInstalledStateProps): PluginCatalogEntry[] {
  return entries.map((entry) => {
    const installed = installedPlugins.find(
      (plugin) => plugin.repo === entry.repo || plugin.alias === entry.name,
    );

    return {
      ...entry,
      installedAlias: installed?.alias ?? null,
      installedVersion: installed?.version ?? null,
      compatibleRef: latestCompatibleRef(entry.refs, coreMajor),
      latestRef: entry.refs.at(-1) ?? null,
    };
  });
}

async function queryPluginCatalog(
  ctx: RouteCommandContext,
): Promise<PluginCatalogEntry[]> {
  const events = await ctx.pool.querySync(
    PLUGIN_QUERY_RELAYS,
    { kinds: [PLUGIN_KIND], limit: 50 },
    { maxWait: 10_000 },
  );

  const latestByPlugin = new Map<string, PluginCatalogEntry>();

  for (const event of events) {
    const parsed = parsePluginEvent(event);

    if (!parsed) {
      continue;
    }

    const key = `${parsed.pubkey}:${parsed.name}`;
    const existing = latestByPlugin.get(key);

    if (!existing || parsed.createdAt > existing.createdAt) {
      latestByPlugin.set(key, parsed);
    }
  }

  return [...latestByPlugin.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function handlePluginsInstall(
  ctx: RouteCommandContext,
): Promise<ReturnType<typeof renderPluginsInstallWeb> | string> {
  const coreMajor = readCoreMajor(ctx.dmBotRoot);
  const installedPlugins = readInstalledPlugins(ctx.dmBotRoot);

  const entries = attachInstalledState({
    entries: await queryPluginCatalog(ctx),
    installedPlugins,
    coreMajor,
  });

  const representation: PluginsInstallRepresentation = {
    coreMajor,
    relays: PLUGIN_QUERY_RELAYS,
    entries,
  };

  if (ctx.source === 'web') {
    return renderPluginsInstallWeb(representation);
  }

  return renderPluginsInstallText(representation, { prefix: ctx.prefix });
}
