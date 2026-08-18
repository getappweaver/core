import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { NostrEvent } from 'nostr-tools';

import {
  capabilityCatalogLabel,
  matchesCapabilityCatalogFilter,
  normalizeCapabilityRelations,
  parseCapabilityCatalogFilter,
  parseCapabilityRelationTags,
  type CapabilityCatalogFilter,
  type PluginCapabilityRelations,
} from '@src/capabilities/relations';
import { writeRestartRequestedFile } from '@src/commands/bot/request-watch-restart';
import type { CoreUpdateSnapshot } from '@src/core/update-check';
import {
  authorHref,
  decodeNpub,
  fallbackAuthorIdentity,
  normalizeNip05,
  resolveNip05Identity,
  verifyNip05,
  type AuthorIdentity,
} from '@src/nostr/author-identity';
import {
  extractSha256FromUrl,
  fetchBlossomServerUrls,
  resolveVerifiedBlossomDataUrl,
} from '@src/nostr/blossom';
import { fetchNip65RelaySet, uniqueRelays } from '@src/nostr/nip65';
import {
  nostrRepoAddress,
  parseNostrRepoAddress,
  repoAddressAuthorNip05,
  repoAddressAuthorNpub,
} from '@src/nostr/repo-address';

import type { RouteCommandContext } from '../../dispatch';

import { renderPluginsInstallText } from './renderers/text';
import { renderPluginsInstallWeb } from './renderers/web';

const PLUGIN_KIND = 32107;

export const PLUGIN_QUERY_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://nostr.mom',
];

const PLUGIN_QUERY_MAX_WAIT_MS = 10_000;
const AUTHOR_PROFILE_QUERY_MAX_WAIT_MS = 2_000;
const PLUGIN_ICON_MAX_BYTES = 1024 * 1024;
const PLUGIN_ICON_FETCH_TIMEOUT_MS = 5_000;

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
  iconUrl: string;
  iconSource: string;
  website: string;
  description: string;
  version: string;
  coreApiVersion: string;
  repo: string;
  author: AuthorIdentity;
  refs: RefEntry[];
  installedAlias: string | null;
  installedVersion: string | null;
  compatibleRef: RefEntry | null;
  latestRef: RefEntry | null;
  blockedUpdateRef: RefEntry | null;
  coreUpdateCanUnlockBlockedRef: boolean;
  changelogRefs: RefEntry[];
  updateAvailable: boolean;
  capabilities: PluginCapabilityRelations;
};

export type InstalledPluginEntry = {
  alias: string;
  name?: string;
  repo: string;
  version?: string;
};

type PluginsJson = {
  plugins: InstalledPluginEntry[];
};

type ResolvedPluginTarget = {
  repoId: string;
  pubkey: string;
  authorHint: string;
  relays: string[];
  repoAddress: string;
};

type QueryPluginCatalogOptions = {
  relays: string[] | null;
  authors: string[] | null;
};

function isInstalledPluginEntry(entry: unknown): entry is InstalledPluginEntry {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    typeof (entry as InstalledPluginEntry).alias === 'string' &&
    (typeof (entry as InstalledPluginEntry).name === 'undefined' ||
      typeof (entry as InstalledPluginEntry).name === 'string') &&
    typeof (entry as InstalledPluginEntry).repo === 'string' &&
    (typeof (entry as InstalledPluginEntry).version === 'undefined' ||
      typeof (entry as InstalledPluginEntry).version === 'string')
  );
}

function normalizeInstalledPluginEntry(
  entry: InstalledPluginEntry,
): InstalledPluginEntry {
  return {
    alias: entry.alias,
    ...(entry.name ? { name: entry.name } : {}),
    repo: entry.repo,
    ...(entry.version ? { version: entry.version } : {}),
  };
}

export type PluginsInstallRepresentation = {
  coreVersion: string;
  coreUpdate: CoreUpdateSnapshot | null;
  relays: string[];
  entries: PluginCatalogEntry[];
  filter: string | null;
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

  const iconTag = event.tags.find((tag) => tag[0] === 'icon');

  return {
    id: event.id,
    createdAt: event.created_at,
    pubkey: event.pubkey,
    name,
    title: tagValue(event.tags, 'title'),
    icon: tagValue(event.tags, 'icon'),
    iconUrl: tagValue(event.tags, 'icon'),
    iconSource: iconTag?.[2] ?? '',
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
    blockedUpdateRef: null,
    coreUpdateCanUnlockBlockedRef: false,
    changelogRefs: [],
    updateAvailable: false,
    capabilities: parseCapabilityRelationTags(event.kind, event.tags),
  };
}

function repoAuthorHint(repo: string): string | null {
  if (!repo.startsWith('nostr://')) {
    return null;
  }

  const rest = repo.slice('nostr://'.length);
  const firstSegment = rest.split('/')[0]?.trim() ?? '';

  return firstSegment || null;
}

async function resolvePluginTarget(
  ctx: RouteCommandContext,
  target: string,
): Promise<ResolvedPluginTarget | null> {
  const parsed = parseNostrRepoAddress(target);

  if (!parsed) {
    return null;
  }

  const npubPubkey = repoAddressAuthorNpub(parsed.authorHint);
  const nip05 = repoAddressAuthorNip05(parsed.authorHint);
  const identity = npubPubkey ? null : await resolveNip05Identity(nip05 ?? '');
  const pubkey = npubPubkey ?? identity?.pubkey ?? '';

  const discoveryRelays = uniqueRelays([
    ...parsed.relayHints,
    ...(identity?.relays ?? []),
    ...PLUGIN_QUERY_RELAYS,
  ]);

  if (!pubkey) {
    return null;
  }

  const nip65Relays = await fetchNip65RelaySet({
    pool: ctx.pool,
    authorPubkey: pubkey,
    fallbackRelays: discoveryRelays,
  });

  const relays = uniqueRelays([
    ...discoveryRelays,
    ...nip65Relays.readRelays,
    ...nip65Relays.writeRelays,
  ]);

  return {
    repoId: parsed.repoId,
    pubkey,
    authorHint: parsed.authorHint,
    relays,
    repoAddress: nostrRepoAddress({
      authorHint: parsed.authorHint,
      repoId: parsed.repoId,
      relayHints: relays,
    }),
  };
}

function pluginTargetMatches({
  entry,
  normalizedTarget,
  resolvedTarget,
}: {
  entry: PluginCatalogEntry;
  normalizedTarget: string;
  resolvedTarget: ResolvedPluginTarget | null;
}): boolean {
  if (resolvedTarget) {
    return (
      entry.pubkey === resolvedTarget.pubkey &&
      [entry.name, suggestedAlias(entry.name), entry.repo]
        .filter(Boolean)
        .some((value) => {
          const parsed = parseNostrRepoAddress(value);

          return parsed
            ? parsed.repoId.toLowerCase() ===
                resolvedTarget.repoId.toLowerCase()
            : value.toLowerCase() === resolvedTarget.repoId.toLowerCase();
        })
    );
  }

  return [entry.id, entry.name, entry.title]
    .filter(Boolean)
    .some((value) => value.toLowerCase() === normalizedTarget);
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
): Promise<AuthorIdentity> {
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
        nip05: normalized,
        lud16: null,
        lud06: null,
      };
    }

    return fallback;
  }

  const normalized = normalizeNip05(primaryHint);

  if (
    normalized &&
    (await verifyNip05({ nip05: normalized, expectedPubkey: entry.pubkey }))
  ) {
    return {
      label: normalized,
      href: authorHref(normalized),
      verified: true,
      nip05: normalized,
      lud16: null,
      lud06: null,
    };
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

async function resolvePluginIcon(
  ctx: RouteCommandContext,
  entry: PluginCatalogEntry,
  serverUrls: string[],
): Promise<string> {
  if (
    (!entry.icon.startsWith('https://') && !entry.icon.startsWith('http://')) ||
    !extractSha256FromUrl(entry.icon)
  ) {
    return entry.icon;
  }

  return (
    (await resolveVerifiedBlossomDataUrl({
      sourceUrl: entry.icon,
      serverUrls,
      maxBytes: PLUGIN_ICON_MAX_BYTES,
      timeoutMs: PLUGIN_ICON_FETCH_TIMEOUT_MS,
    })) ?? entry.icon
  );
}

async function attachResolvedIcons(
  ctx: RouteCommandContext,
  entries: PluginCatalogEntry[],
): Promise<PluginCatalogEntry[]> {
  const serversByAuthor = new Map<string, Promise<string[]>>();

  function serverUrlsFor(entry: PluginCatalogEntry): Promise<string[]> {
    const existing = serversByAuthor.get(entry.pubkey);

    if (existing) {
      return existing;
    }

    const serverUrls = fetchBlossomServerUrls({
      pool: ctx.pool,
      relayUrls: PLUGIN_QUERY_RELAYS,
      authorPubkey: entry.pubkey,
    });

    serversByAuthor.set(entry.pubkey, serverUrls);

    return serverUrls;
  }

  return Promise.all(
    entries.map(async (entry) => {
      if (
        (!entry.icon.startsWith('https://') &&
          !entry.icon.startsWith('http://')) ||
        !extractSha256FromUrl(entry.icon)
      ) {
        return entry;
      }

      return {
        ...entry,
        icon: await resolvePluginIcon(ctx, entry, await serverUrlsFor(entry)),
      };
    }),
  );
}

function readCoreVersion(dmBotRoot: string): string {
  const pkgPath = join(dmBotRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

  return pkg.version;
}

export function readInstalledPlugins(
  dmBotRoot: string,
): InstalledPluginEntry[] {
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

  return parsed.plugins
    .filter(isInstalledPluginEntry)
    .map(normalizeInstalledPluginEntry);
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
    plugins: parsed.plugins
      .filter(isInstalledPluginEntry)
      .map(normalizeInstalledPluginEntry),
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

function normalizeRefTag(tag: string): string {
  const normalized = tag.trim().toLowerCase();

  return normalized.startsWith('v') ? normalized.slice(1) : normalized;
}

function comparePluginVersions(left: string, right: string): number | null {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);

  if (!leftParts || !rightParts) {
    return null;
  }

  return compareVersionParts(leftParts, rightParts);
}

function isUpdateAvailable(
  installedVersion: string | null,
  compatibleRef: RefEntry | null,
): boolean {
  if (!compatibleRef) {
    return false;
  }

  if (!installedVersion) {
    return true;
  }

  if (
    normalizeRefTag(installedVersion) === normalizeRefTag(compatibleRef.tag)
  ) {
    return false;
  }

  const compared = comparePluginVersions(installedVersion, compatibleRef.tag);

  return compared === null ? true : compared < 0;
}

function isRefNewerThanInstalled({
  ref,
  installedVersion,
}: {
  ref: RefEntry;
  installedVersion: string | null;
}): boolean {
  if (!installedVersion) {
    return true;
  }

  if (normalizeRefTag(installedVersion) === normalizeRefTag(ref.tag)) {
    return false;
  }

  const compared = comparePluginVersions(installedVersion, ref.tag);

  return compared === null ? true : compared < 0;
}

function latestCoreVersionFromSnapshot(
  snapshot: CoreUpdateSnapshot | null,
): string | null {
  if (!snapshot) {
    return null;
  }

  return snapshot.remoteVersion ?? snapshot.localVersion;
}

function canCoreUpdateUnlockRef({
  ref,
  coreUpdate,
}: {
  ref: RefEntry | null;
  coreUpdate: CoreUpdateSnapshot | null;
}): boolean {
  if (!ref || coreUpdate?.state !== 'available') {
    return false;
  }

  const latestCoreVersion = latestCoreVersionFromSnapshot(coreUpdate);

  return latestCoreVersion
    ? coreVersionSatisfies(latestCoreVersion, ref.coreApiVersion)
    : false;
}

function blockedUpdateRefForEntry({
  refs,
  coreVersion,
  installedVersion,
  compatibleRef,
}: {
  refs: RefEntry[];
  coreVersion: string;
  installedVersion: string | null;
  compatibleRef: RefEntry | null;
}): RefEntry | null {
  const latestRef = refs.at(-1) ?? null;

  if (
    !latestRef ||
    coreVersionSatisfies(coreVersion, latestRef.coreApiVersion)
  ) {
    return null;
  }

  if (!isRefNewerThanInstalled({ ref: latestRef, installedVersion })) {
    return null;
  }

  if (
    compatibleRef &&
    normalizeRefTag(compatibleRef.tag) === normalizeRefTag(latestRef.tag)
  ) {
    return null;
  }

  return latestRef;
}

type ChangelogRefsForTargetProps = {
  refs: RefEntry[];
  installedVersion: string | null;
  compatibleRef: RefEntry | null;
};

function changelogRefsForTarget({
  refs,
  installedVersion,
  compatibleRef,
}: ChangelogRefsForTargetProps): RefEntry[] {
  if (!compatibleRef) {
    return [];
  }

  const targetVersion = compatibleRef.tag;

  return refs.filter((ref) => {
    const refToTarget = comparePluginVersions(ref.tag, targetVersion);

    if (refToTarget === null || refToTarget > 0) {
      return false;
    }

    if (!installedVersion) {
      return normalizeRefTag(ref.tag) === normalizeRefTag(targetVersion);
    }

    const refToInstalled = comparePluginVersions(ref.tag, installedVersion);

    return refToInstalled === null ? false : refToInstalled > 0;
  });
}

export function readLocalPluginPackageVersion({
  dmBotRoot,
  alias,
}: {
  dmBotRoot: string;
  alias: string;
}): string | null {
  const pkgPath = join(dmBotRoot, 'plugins', alias, 'package.json');

  if (!existsSync(pkgPath)) {
    return null;
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version?: unknown;
    };

    return typeof pkg.version === 'string' && pkg.version.trim().length > 0
      ? pkg.version.trim()
      : null;
  } catch {
    return null;
  }
}

export function readLocalPluginPackageCapabilities({
  dmBotRoot,
  alias,
}: {
  dmBotRoot: string;
  alias: string;
}): PluginCapabilityRelations {
  const pkgPath = join(dmBotRoot, 'plugins', alias, 'package.json');

  if (!existsSync(pkgPath)) {
    return { provides: [], uses: [], requires: [] };
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      appweaver?: { capabilities?: unknown };
    };

    return normalizeCapabilityRelations(pkg.appweaver?.capabilities);
  } catch {
    return { provides: [], uses: [], requires: [] };
  }
}

export function suggestedAlias(pluginName: string): string {
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

type UpdateInstalledCatalogEntryProps = {
  ctx: RouteCommandContext;
  entry: PluginCatalogEntry;
  resolvedTarget: ResolvedPluginTarget | null;
};

function updateInstalledCatalogEntry({
  ctx,
  entry,
  resolvedTarget,
}: UpdateInstalledCatalogEntryProps): InstallCatalogEntryResult {
  if (!entry.installedAlias) {
    return {
      success: false,
      message: `Plugin is not installed: ${entry.title || entry.name}.`,
    };
  }

  if (!entry.compatibleRef) {
    const latest = entry.latestRef
      ? `${entry.latestRef.tag} for core ${entry.latestRef.coreApiVersion}`
      : 'no release refs';

    return {
      success: false,
      message: `No compatible release for bot core ${readCoreVersion(ctx.dmBotRoot)}. Latest catalog ref: ${latest}.`,
    };
  }

  if (!entry.updateAvailable) {
    const installedVersion = entry.installedVersion ?? 'unknown';

    return {
      success: false,
      message: `Plugin ${entry.installedAlias} is already up to date (${installedVersion}).`,
    };
  }

  const pluginDir = join(ctx.dmBotRoot, 'plugins', entry.installedAlias);

  if (!existsSync(pluginDir)) {
    return {
      success: false,
      message: `Plugin directory does not exist: ${pluginDir}`,
    };
  }

  const fetchResult = Bun.spawnSync(['git', 'fetch', '--tags'], {
    cwd: pluginDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (fetchResult.exitCode !== 0) {
    throw new Error(
      `git fetch failed:\n${fetchResult.stdout.toString()}${fetchResult.stderr.toString()}`,
    );
  }

  const checkoutResult = Bun.spawnSync(
    ['git', 'checkout', entry.compatibleRef.tag],
    {
      cwd: pluginDir,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  if (checkoutResult.exitCode !== 0) {
    throw new Error(
      `git checkout failed:\n${checkoutResult.stdout.toString()}${checkoutResult.stderr.toString()}`,
    );
  }

  const pluginsData = readPluginsJson(ctx.dmBotRoot);

  const index = pluginsData.plugins.findIndex(
    (plugin) => plugin.alias === entry.installedAlias,
  );

  if (index === -1) {
    return {
      success: false,
      message: `Plugin ${entry.installedAlias} is not listed in plugins.json.`,
    };
  }

  const current = pluginsData.plugins[index];

  pluginsData.plugins[index] = {
    alias: current.alias,
    ...(current.name ? { name: current.name } : {}),
    repo: resolvedTarget?.repoAddress ?? entry.repo,
  };

  writePluginsJson(ctx.dmBotRoot, pluginsData);
  runGenerator(ctx.dmBotRoot);
  writeRestartRequestedFile();

  const fromVersion = entry.installedVersion ?? 'unknown';

  return {
    success: true,
    message: `Updated ${entry.installedAlias}: ${fromVersion} → ${entry.compatibleRef.tag}.`,
  };
}

async function installCatalogEntry({
  ctx,
  target,
  coreVersion,
  installedPlugins,
}: InstallCatalogEntryProps): Promise<InstallCatalogEntryResult> {
  const resolvedTarget = await resolvePluginTarget(ctx, target);

  const entries = attachInstalledState({
    entries: await queryPluginCatalog(ctx, {
      relays: resolvedTarget?.relays ?? null,
      authors: resolvedTarget ? [resolvedTarget.pubkey] : null,
    }),
    installedPlugins,
    coreVersion,
    coreUpdate: null,
    dmBotRoot: ctx.dmBotRoot,
  });

  const normalizedTarget = target.trim().toLowerCase();

  const entry = entries.find((candidate) =>
    pluginTargetMatches({
      entry: candidate,
      normalizedTarget,
      resolvedTarget,
    }),
  );

  if (!entry) {
    return {
      success: false,
      message: `Plugin not found in catalog: ${target}`,
    };
  }

  if (entry.installedAlias) {
    return updateInstalledCatalogEntry({ ctx, entry, resolvedTarget });
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
    name: entry.name,
    repo: resolvedTarget?.repoAddress ?? entry.repo,
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
  coreUpdate: CoreUpdateSnapshot | null;
  dmBotRoot: string;
};

function attachInstalledState({
  entries,
  installedPlugins,
  coreVersion,
  coreUpdate,
  dmBotRoot,
}: AttachInstalledStateProps): PluginCatalogEntry[] {
  return entries.map((entry) => {
    const installed = installedPlugins.find(
      (plugin) =>
        plugin.repo === entry.repo ||
        plugin.name === entry.name ||
        plugin.alias === entry.name,
    );

    const compatibleRef = latestCompatibleRef(entry.refs, coreVersion);

    const installedVersion = installed
      ? readLocalPluginPackageVersion({ dmBotRoot, alias: installed.alias })
      : null;

    const blockedUpdateRef = blockedUpdateRefForEntry({
      refs: entry.refs,
      coreVersion,
      installedVersion,
      compatibleRef,
    });

    return {
      ...entry,
      installedAlias: installed?.alias ?? null,
      installedVersion,
      compatibleRef,
      latestRef: entry.refs.at(-1) ?? null,
      blockedUpdateRef,
      coreUpdateCanUnlockBlockedRef: canCoreUpdateUnlockRef({
        ref: blockedUpdateRef,
        coreUpdate,
      }),
      changelogRefs: changelogRefsForTarget({
        refs: entry.refs,
        installedVersion,
        compatibleRef,
      }),
      updateAvailable: installed
        ? isUpdateAvailable(installedVersion, compatibleRef)
        : false,
    };
  });
}

export async function queryPluginCatalog(
  ctx: RouteCommandContext,
  options?: QueryPluginCatalogOptions,
  capabilityFilter?: CapabilityCatalogFilter,
): Promise<PluginCatalogEntry[]> {
  const eventsById = new Map<string, NostrEvent>();

  const relays = uniqueRelays([
    ...(options?.relays ?? []),
    ...PLUGIN_QUERY_RELAYS,
  ]);

  const filter = {
    kinds: [PLUGIN_KIND],
    ...(options?.authors ? { authors: options.authors } : {}),
    ...(capabilityFilter
      ? { '#l': [capabilityCatalogLabel(capabilityFilter)] }
      : {}),
    limit: 50,
  };

  const events = await new Promise<NostrEvent[]>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish('timeout'), PLUGIN_QUERY_MAX_WAIT_MS);

    const sub = ctx.pool.subscribeMany(relays, filter, {
      maxWait: PLUGIN_QUERY_MAX_WAIT_MS,
      onevent: (event) => {
        eventsById.set(event.id, event as NostrEvent);
      },
      oneose: () => finish('eose'),
      onclose: () => {
        finish('closed');
      },
    });

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

  const entries = [...latestByPlugin.values()]
    .filter((entry) =>
      capabilityFilter
        ? matchesCapabilityCatalogFilter(entry.capabilities, capabilityFilter)
        : true,
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const entriesWithAuthors = await attachAuthorIdentities(ctx, entries);

  return attachResolvedIcons(ctx, entriesWithAuthors);
}

export async function handlePluginsInstall(
  ctx: RouteCommandContext,
): Promise<ReturnType<typeof renderPluginsInstallWeb> | string> {
  const coreVersion = readCoreVersion(ctx.dmBotRoot);
  const coreUpdate = (await ctx.coreUpdateChecker?.checkNow()) ?? null;
  const installedPlugins = readInstalledPlugins(ctx.dmBotRoot);
  const target = ctx.args[1]?.trim() ?? '';
  const capabilityFilter = parseCapabilityCatalogFilter(target);

  if (target && !capabilityFilter) {
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
      coreUpdate,
      dmBotRoot: ctx.dmBotRoot,
    });

    return renderPluginsInstallWeb({
      coreVersion,
      coreUpdate,
      relays: PLUGIN_QUERY_RELAYS,
      entries,
      filter: null,
    });
  }

  const entries = attachInstalledState({
    entries: await queryPluginCatalog(
      ctx,
      undefined,
      capabilityFilter ?? undefined,
    ),
    installedPlugins,
    coreVersion,
    coreUpdate,
    dmBotRoot: ctx.dmBotRoot,
  });

  const representation: PluginsInstallRepresentation = {
    coreVersion,
    coreUpdate,
    relays: PLUGIN_QUERY_RELAYS,
    entries,
    filter: capabilityFilter ? target : null,
  };

  if (ctx.source === 'web') {
    return renderPluginsInstallWeb(representation);
  }

  return renderPluginsInstallText(representation, { prefix: ctx.prefix });
}
