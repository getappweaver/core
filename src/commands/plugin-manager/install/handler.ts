import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { nip19, type NostrEvent } from 'nostr-tools';

import { writeRestartRequestedFile } from '@src/commands/bot/request-watch-restart';

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

const PLUGIN_QUERY_MAX_WAIT_MS = 10_000;
const AUTHOR_PROFILE_QUERY_MAX_WAIT_MS = 2_000;
const NIP05_VERIFY_MAX_WAIT_MS = 3_000;

type RefEntry = {
  tag: string;
  coreApiVersion: string;
  changelog: string;
};

export type PluginCatalogEntry = {
  id: string;
  createdAt: number;
  pubkey: string;
  name: string;
  title: string;
  icon: string;
  website: string;
  description: string;
  version: string;
  coreApiVersion: string;
  repo: string;
  author: PluginAuthorIdentity;
  refs: RefEntry[];
  installedAlias: string | null;
  installedVersion: string | null;
  compatibleRef: RefEntry | null;
  latestRef: RefEntry | null;
};

export type PluginAuthorIdentity = {
  label: string;
  href: string;
  verified: boolean;
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
  coreVersion: string;
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
      coreApiVersion: tag[2],
      changelog: tag[3],
    }));

  return {
    id: event.id,
    createdAt: event.created_at,
    pubkey: event.pubkey,
    name,
    title: tagValue(event.tags, 'title'),
    icon: tagValue(event.tags, 'icon'),
    website: tagValue(event.tags, 'website'),
    description: event.content,
    version: tagValue(event.tags, 'version'),
    coreApiVersion: tagValue(event.tags, 'coreApiVersion'),
    repo,
    author: fallbackAuthorIdentity(event.pubkey),
    refs,
    installedAlias: null,
    installedVersion: null,
    compatibleRef: null,
    latestRef: refs.at(-1) ?? null,
  };
}

function maskedNpub(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);

    return `${npub.slice(0, 12)}...${npub.slice(-6)}`;
  } catch {
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
  }
}

function npubHref(pubkey: string): string {
  try {
    return `https://nosta.me/${nip19.npubEncode(pubkey)}`;
  } catch {
    return `https://nosta.me/${pubkey}`;
  }
}

function fallbackAuthorIdentity(pubkey: string): PluginAuthorIdentity {
  return {
    label: maskedNpub(pubkey),
    href: npubHref(pubkey),
    verified: false,
  };
}

function authorHref(nip05: string): string {
  return `https://nosta.me/${nip05.replace(/^_@/, '')}`;
}

function repoAuthorHint(repo: string): string | null {
  if (!repo.startsWith('nostr://')) {
    return null;
  }

  const rest = repo.slice('nostr://'.length);
  const firstSegment = rest.split('/')[0]?.trim() ?? '';

  return firstSegment || null;
}

function normalizeNip05(value: string): string | null {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('@')) {
    return `_${trimmed}`;
  }

  if (!trimmed.includes('@')) {
    return `_${trimmed.startsWith('@') ? '' : '@'}${trimmed}`;
  }

  return trimmed;
}

function decodeNpub(value: string): string | null {
  try {
    const decoded = nip19.decode(value);

    return decoded.type === 'npub' && typeof decoded.data === 'string'
      ? decoded.data
      : null;
  } catch {
    return null;
  }
}

type VerifyNip05Props = {
  nip05: string;
  expectedPubkey: string;
};

async function verifyNip05({
  nip05,
  expectedPubkey,
}: VerifyNip05Props): Promise<boolean> {
  const normalized = normalizeNip05(nip05);

  if (!normalized) {
    return false;
  }

  const [name, domain] = normalized.split('@');

  if (!name || !domain) {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NIP05_VERIFY_MAX_WAIT_MS);

  try {
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { names?: Record<string, unknown> };
    const pubkey = data.names?.[name];

    return typeof pubkey === 'string' && pubkey === expectedPubkey;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function queryProfileNip05(
  ctx: RouteCommandContext,
  pubkey: string,
): Promise<string | null> {
  const events = await ctx.pool.querySync(
    PLUGIN_QUERY_RELAYS,
    { kinds: [0], authors: [pubkey], limit: 1 },
    { maxWait: AUTHOR_PROFILE_QUERY_MAX_WAIT_MS },
  );

  const latest = events.sort((a, b) => b.created_at - a.created_at)[0];

  if (!latest) {
    return null;
  }

  try {
    const content = JSON.parse(latest.content) as { nip05?: unknown };

    return typeof content.nip05 === 'string' ? content.nip05 : null;
  } catch {
    return null;
  }
}

async function authorIdentityForEntry(
  ctx: RouteCommandContext,
  entry: PluginCatalogEntry,
): Promise<PluginAuthorIdentity> {
  const hint = repoAuthorHint(entry.repo);
  const fallback = fallbackAuthorIdentity(entry.pubkey);

  if (!hint) {
    return fallback;
  }

  const [primaryHint, secondaryHint] = hint.split('|');
  const hintedPubkey = decodeNpub(primaryHint);

  if (hintedPubkey) {
    if (hintedPubkey !== entry.pubkey) {
      return fallback;
    }

    const nip05 = secondaryHint || (await queryProfileNip05(ctx, entry.pubkey));
    const normalized = nip05 ? normalizeNip05(nip05) : null;

    if (
      normalized &&
      (await verifyNip05({ nip05: normalized, expectedPubkey: entry.pubkey }))
    ) {
      return {
        label: normalized,
        href: authorHref(normalized),
        verified: true,
      };
    }

    return fallback;
  }

  const normalized = normalizeNip05(primaryHint);

  if (
    normalized &&
    (await verifyNip05({ nip05: normalized, expectedPubkey: entry.pubkey }))
  ) {
    return { label: normalized, href: authorHref(normalized), verified: true };
  }

  return fallback;
}

async function attachAuthorIdentities(
  ctx: RouteCommandContext,
  entries: PluginCatalogEntry[],
): Promise<PluginCatalogEntry[]> {
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      author: await authorIdentityForEntry(ctx, entry),
    })),
  );
}

function readCoreVersion(dmBotRoot: string): string {
  const pkgPath = join(dmBotRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

  return pkg.version;
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

function readPluginsJson(dmBotRoot: string): PluginsJson {
  const pluginsJsonPath = join(dmBotRoot, 'plugins.json');

  if (!existsSync(pluginsJsonPath)) {
    return { plugins: [] };
  }

  const parsed = JSON.parse(
    readFileSync(pluginsJsonPath, 'utf8'),
  ) as PluginsJson;

  if (!Array.isArray(parsed.plugins)) {
    return { plugins: [] };
  }

  return {
    plugins: parsed.plugins.filter((entry): entry is InstalledPluginEntry => {
      return (
        entry !== null &&
        typeof entry === 'object' &&
        typeof entry.alias === 'string' &&
        typeof entry.repo === 'string' &&
        typeof entry.version === 'string'
      );
    }),
  };
}

function writePluginsJson(dmBotRoot: string, data: PluginsJson): void {
  writeFileSync(
    join(dmBotRoot, 'plugins.json'),
    JSON.stringify(data, null, 2) + '\n',
    'utf8',
  );
}

function parseVersionParts(value: string): [number, number, number] | null {
  const match = value.trim().match(/^(?:\^)?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);

  if (!match) {
    return null;
  }

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2] ?? '0', 10),
    Number.parseInt(match[3] ?? '0', 10),
  ];
}

function compareVersionParts(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }

  return 0;
}

function coreVersionSatisfies(coreVersion: string, range: string): boolean {
  const normalizedRange = range.trim();
  const core = parseVersionParts(coreVersion);

  if (!core) {
    return false;
  }

  if (/^\d+$/.test(normalizedRange)) {
    return String(core[0]) === normalizedRange;
  }

  const minimum = parseVersionParts(normalizedRange);

  if (!minimum) {
    return false;
  }

  if (normalizedRange.startsWith('^')) {
    return core[0] === minimum[0] && compareVersionParts(core, minimum) >= 0;
  }

  return compareVersionParts(core, minimum) >= 0;
}

function latestCompatibleRef(
  refs: RefEntry[],
  coreVersion: string,
): RefEntry | null {
  return (
    refs
      .filter((ref) => coreVersionSatisfies(coreVersion, ref.coreApiVersion))
      .at(-1) ?? null
  );
}

function suggestedAlias(pluginName: string): string {
  return pluginName
    .replace(/^(?:appweaver|dm-bot)-/, '')
    .replace(/-plugin$/, '');
}

function runGenerator(dmBotRoot: string): void {
  const result = Bun.spawnSync(['bun', 'run', 'scripts/generate-tools.ts'], {
    cwd: dmBotRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Generator failed:\n${result.stdout.toString()}${result.stderr.toString()}`,
    );
  }
}

type InstallCatalogEntryProps = {
  ctx: RouteCommandContext;
  target: string;
  coreVersion: string;
  installedPlugins: InstalledPluginEntry[];
};

type InstallCatalogEntryResult = {
  success: boolean;
  message: string;
};

async function installCatalogEntry({
  ctx,
  target,
  coreVersion,
  installedPlugins,
}: InstallCatalogEntryProps): Promise<InstallCatalogEntryResult> {
  const entries = attachInstalledState({
    entries: await queryPluginCatalog(ctx),
    installedPlugins,
    coreVersion,
  });

  const normalizedTarget = target.trim().toLowerCase();

  const entry = entries.find((candidate) => {
    return [candidate.id, candidate.name, candidate.title]
      .filter(Boolean)
      .some((value) => value.toLowerCase() === normalizedTarget);
  });

  if (!entry) {
    return {
      success: false,
      message: `Plugin not found in catalog: ${target}`,
    };
  }

  if (entry.installedAlias) {
    return {
      success: false,
      message: `Plugin already installed as ${entry.installedAlias} @ ${entry.installedVersion}.`,
    };
  }

  if (!entry.compatibleRef) {
    const latest = entry.latestRef
      ? `${entry.latestRef.tag} for core ${entry.latestRef.coreApiVersion}`
      : 'no release refs';

    return {
      success: false,
      message: `No compatible release for bot core ${coreVersion}. Latest catalog ref: ${latest}.`,
    };
  }

  const alias = suggestedAlias(entry.name);
  const pluginsData = readPluginsJson(ctx.dmBotRoot);

  if (pluginsData.plugins.some((plugin) => plugin.alias === alias)) {
    return {
      success: false,
      message: `Alias "${alias}" is already in use. Use the CLI installer to choose a custom alias.`,
    };
  }

  const destDir = join(ctx.dmBotRoot, 'plugins', alias);

  if (existsSync(destDir)) {
    return {
      success: false,
      message: `Plugin directory already exists: ${destDir}`,
    };
  }

  const cloneResult = Bun.spawnSync(
    [
      'git',
      'clone',
      '--branch',
      entry.compatibleRef.tag,
      '--depth',
      '1',
      entry.repo,
      destDir,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  if (cloneResult.exitCode !== 0) {
    throw new Error(
      `git clone failed:\n${cloneResult.stdout.toString()}${cloneResult.stderr.toString()}`,
    );
  }

  pluginsData.plugins.push({
    alias,
    repo: entry.repo,
    version: entry.compatibleRef.tag,
  });

  writePluginsJson(ctx.dmBotRoot, pluginsData);
  runGenerator(ctx.dmBotRoot);
  writeRestartRequestedFile();

  return {
    success: true,
    message: `Installed ${entry.title || entry.name} as ${alias} @ ${entry.compatibleRef.tag}.`,
  };
}

type AttachInstalledStateProps = {
  entries: PluginCatalogEntry[];
  installedPlugins: InstalledPluginEntry[];
  coreVersion: string;
};

function attachInstalledState({
  entries,
  installedPlugins,
  coreVersion,
}: AttachInstalledStateProps): PluginCatalogEntry[] {
  return entries.map((entry) => {
    const installed = installedPlugins.find(
      (plugin) => plugin.repo === entry.repo || plugin.alias === entry.name,
    );

    return {
      ...entry,
      installedAlias: installed?.alias ?? null,
      installedVersion: installed?.version ?? null,
      compatibleRef: latestCompatibleRef(entry.refs, coreVersion),
      latestRef: entry.refs.at(-1) ?? null,
    };
  });
}

async function queryPluginCatalog(
  ctx: RouteCommandContext,
): Promise<PluginCatalogEntry[]> {
  const eventsById = new Map<string, NostrEvent>();

  const events = await new Promise<NostrEvent[]>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish('timeout'), PLUGIN_QUERY_MAX_WAIT_MS);

    const sub = ctx.pool.subscribeMany(
      PLUGIN_QUERY_RELAYS,
      { kinds: [PLUGIN_KIND], limit: 50 },
      {
        maxWait: PLUGIN_QUERY_MAX_WAIT_MS,
        onevent: (event) => {
          eventsById.set(event.id, event as NostrEvent);
        },
        oneose: () => finish('eose'),
        onclose: () => {
          finish('closed');
        },
      },
    );

    function finish(reason: 'closed' | 'eose' | 'timeout'): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      sub.close(`plugins install ${reason}`);
      resolve([...eventsById.values()]);
    }
  });

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

  const entries = [...latestByPlugin.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return attachAuthorIdentities(ctx, entries);
}

export async function handlePluginsInstall(
  ctx: RouteCommandContext,
): Promise<ReturnType<typeof renderPluginsInstallWeb> | string> {
  const coreVersion = readCoreVersion(ctx.dmBotRoot);
  const installedPlugins = readInstalledPlugins(ctx.dmBotRoot);
  const target = ctx.args[1]?.trim() ?? '';

  if (target) {
    const result = await installCatalogEntry({
      ctx,
      target,
      coreVersion,
      installedPlugins,
    });

    if (!result.success || ctx.source !== 'web') {
      return result.message;
    }

    const entries = attachInstalledState({
      entries: await queryPluginCatalog(ctx),
      installedPlugins: readInstalledPlugins(ctx.dmBotRoot),
      coreVersion,
    });

    return renderPluginsInstallWeb({
      coreVersion,
      relays: PLUGIN_QUERY_RELAYS,
      entries,
    });
  }

  const entries = attachInstalledState({
    entries: await queryPluginCatalog(ctx),
    installedPlugins,
    coreVersion,
  });

  const representation: PluginsInstallRepresentation = {
    coreVersion,
    relays: PLUGIN_QUERY_RELAYS,
    entries,
  };

  if (ctx.source === 'web') {
    return renderPluginsInstallWeb(representation);
  }

  return renderPluginsInstallText(representation, { prefix: ctx.prefix });
}
