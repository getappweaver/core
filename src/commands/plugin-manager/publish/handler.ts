import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { nip19, type EventTemplate, type NostrEvent } from 'nostr-tools';

import {
  capabilityRelationTags,
  capabilityRelationsEqual,
  normalizeCapabilityRelations,
  type PluginCapabilityRelations,
  PluginCapabilityRelationsSchema,
} from '@src/capabilities/relations';
import type { RouteCommandContext } from '@src/commands/dispatch';
import { decodeNpub, verifyNip05 } from '@src/nostr/author-identity';
import { bunkerSignEvent } from '@src/nostr/bunker';
import { listConnections, type ConnectionRow } from '@src/nostr/connections';
import {
  NIP65_RELAY_LIST_KIND,
  parseNip65RelayTags,
  PROFILE_RELAYS_FOR_QUERY,
  uniqueRelays,
} from '@src/nostr/nip65';
import {
  parseNostrRepoAddress,
  repoAddressAuthorNip05,
  repoAddressAuthorNpub,
} from '@src/nostr/repo-address';
import {
  readPluginSvgIcon,
  uploadPluginIcon,
} from '@src/plugin-lifecycle/icon';
import {
  isLocalPluginRepo,
  setPluginRepository,
} from '@src/plugin-lifecycle/manifest';

import {
  type InstalledPluginEntry,
  type PluginCatalogEntry,
  queryPluginCatalog,
  readInstalledPlugins,
  suggestedAlias,
} from '../install/handler';
import { inspectPluginReleaseGit, pushPluginRelease } from '../release-git';

import { renderPluginsPublishText } from './renderers/text';
import {
  renderPluginsPublishPreviewWeb,
  renderPluginsPublishWeb,
} from './renderers/web';

const PLUGIN_KIND = 32107;

const PLUGIN_PUBLISH_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://nostr.mom',
];

const CHANGELOG_COMMIT_LIMIT = 20;

type RefEntry = {
  tag: string;
  coreApiVersion: string;
  changelog: string;
};

type PluginPackage = {
  name: string;
  version: string;
  title: string;
  website: string | null;
  iconPath: string | null;
  description: string;
  coreApiVersion: string;
  capabilities: PluginCapabilityRelations;
};

export type PublishRelayResult = {
  relay: string;
  ok: boolean;
  error: string | null;
};

export type PluginsPublishRepresentation = {
  alias: string;
  pluginName: string;
  versionTag: string;
  eventId: string | null;
  status: 'published' | 'already-published' | 'failed';
  message: string;
  relays: PublishRelayResult[];
};

export type PluginsPublishPreviewRepresentation = {
  alias: string;
  pluginName: string;
  title: string;
  versionTag: string;
  signerName: string;
  signerPubkey: string;
  repo: string;
  iconPath: string | null;
  website: string | null;
  coreApiVersion: string;
  capabilities: PluginCapabilityRelations;
  description: string;
  refs: RefEntry[];
  relays: string[];
  firstPublish: boolean;
};

const latestPublishResults = new Map<string, PluginsPublishRepresentation>();

export function latestPluginPublishResult(
  alias: string,
): PluginsPublishRepresentation | null {
  return latestPublishResults.get(alias) ?? null;
}

function rememberPublishResult(
  representation: PluginsPublishRepresentation,
): PluginsPublishRepresentation {
  latestPublishResults.set(representation.alias, representation);

  return representation;
}

function readPluginPackage({
  dmBotRoot,
  alias,
}: {
  dmBotRoot: string;
  alias: string;
}): PluginPackage {
  const pkgPath = join(dmBotRoot, 'plugins', alias, 'package.json');

  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json found for plugin alias: ${alias}`);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    name?: unknown;
    version?: unknown;
    description?: unknown;
    appweaver?: {
      title?: unknown;
      icon?: unknown;
      website?: unknown;
      description?: unknown;
      coreApiVersion?: unknown;
      capabilities?: unknown;
    };
  };

  if (typeof pkg.name !== 'string' || pkg.name.trim().length === 0) {
    throw new Error(`Plugin package is missing name: ${alias}`);
  }

  if (typeof pkg.version !== 'string' || pkg.version.trim().length === 0) {
    throw new Error(`Plugin package is missing version: ${alias}`);
  }

  if (
    typeof pkg.appweaver?.title !== 'string' ||
    pkg.appweaver.title.trim().length === 0
  ) {
    throw new Error(`Plugin package is missing appweaver.title: ${alias}`);
  }

  if (
    typeof pkg.appweaver?.coreApiVersion !== 'string' ||
    pkg.appweaver.coreApiVersion.trim().length === 0
  ) {
    throw new Error(
      `Plugin package is missing appweaver.coreApiVersion: ${alias}`,
    );
  }

  const description =
    typeof pkg.appweaver.description === 'string'
      ? pkg.appweaver.description
      : typeof pkg.description === 'string'
        ? pkg.description
        : '';

  const capabilities = PluginCapabilityRelationsSchema.safeParse(
    pkg.appweaver.capabilities,
  );

  if (!capabilities.success) {
    throw new Error(
      `Plugin package has invalid appweaver.capabilities: ${alias}`,
    );
  }

  const website =
    typeof pkg.appweaver.website === 'string' &&
    pkg.appweaver.website.trim().length > 0
      ? pkg.appweaver.website.trim()
      : null;

  if (website) {
    try {
      new URL(website);
    } catch {
      throw new Error(`Plugin package has invalid appweaver.website: ${alias}`);
    }
  }

  return {
    name: pkg.name.trim(),
    version: pkg.version.trim(),
    title: pkg.appweaver.title.trim(),
    website,
    iconPath:
      typeof pkg.appweaver.icon === 'string' &&
      pkg.appweaver.icon.trim().length > 0
        ? pkg.appweaver.icon.trim()
        : null,
    description,
    coreApiVersion: pkg.appweaver.coreApiVersion.trim(),
    capabilities: normalizeCapabilityRelations(capabilities.data),
  };
}

export function pluginMetadataMatchesPackage({
  dmBotRoot,
  alias,
  published,
}: {
  dmBotRoot: string;
  alias: string;
  published: PluginCatalogEntry;
}): boolean {
  const pkg = readPluginPackage({ dmBotRoot, alias });

  const icon = pkg.iconPath
    ? readPluginSvgIcon({
        pluginDir: join(dmBotRoot, 'plugins', alias),
        iconPath: pkg.iconPath,
      })
    : null;

  const iconHash = icon
    ? new Bun.CryptoHasher('sha256').update(icon.data).digest('hex')
    : null;

  const iconMatches = icon
    ? published.iconSource === icon.path &&
      published.iconUrl.includes(iconHash ?? '')
    : true;

  return (
    published.name === pkg.name &&
    published.title === pkg.title &&
    published.website === (pkg.website ?? '') &&
    published.description === pkg.description &&
    published.coreApiVersion === pkg.coreApiVersion &&
    capabilityRelationsEqual(pkg.capabilities, published.capabilities) &&
    iconMatches
  );
}

function pluginMatchesInstalled(
  installed: InstalledPluginEntry,
  published: PluginCatalogEntry,
): boolean {
  const installedName = installed.name ?? installed.alias;

  return (
    published.repo === installed.repo ||
    published.name === installedName ||
    suggestedAlias(published.name) === installed.alias
  );
}

function findPublishedPlugin({
  installed,
  catalog,
}: {
  installed: InstalledPluginEntry;
  catalog: PluginCatalogEntry[];
}): PluginCatalogEntry | null {
  return (
    catalog
      .filter((entry) => pluginMatchesInstalled(installed, entry))
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}

function requestedSignerName(args: string[]): string | null {
  const index = args.indexOf('--signer');
  const value = index >= 0 ? args[index + 1]?.trim() : null;

  return value || null;
}

function publishConfirmed(ctx: RouteCommandContext): boolean {
  if (ctx.args.includes('--confirm')) {
    return true;
  }

  if (ctx.jsonPayload === null || typeof ctx.jsonPayload !== 'object') {
    return false;
  }

  const options = (ctx.jsonPayload as { options?: unknown }).options;

  return (
    options !== null &&
    typeof options === 'object' &&
    (options as { confirm?: unknown }).confirm === true
  );
}

function findAuthorConnection({
  ctx,
  published,
  signerName,
}: {
  ctx: RouteCommandContext;
  published: PluginCatalogEntry | null;
  signerName: string | null;
}): ConnectionRow {
  const connections = listConnections(ctx.seenDb);

  const connection = published
    ? connections.find((item) => item.data.userPubkey === published.pubkey)
    : connections.find((item) => item.name === signerName);

  if (!connection) {
    if (!published) {
      throw new Error(
        signerName
          ? `Saved bunker connection not found: ${signerName}`
          : 'Choose a bunker signer for the first publication.',
      );
    }

    throw new Error(
      `No saved bunker connection matches published plugin author ${published.pubkey}.`,
    );
  }

  return connection;
}

async function verifyRepositoryOwner({
  repo,
  expectedPubkey,
}: {
  repo: string;
  expectedPubkey: string;
}): Promise<void> {
  const address = parseNostrRepoAddress(repo);

  if (!address) {
    throw new Error(
      `First publication requires a nostr:// repository: ${repo}`,
    );
  }

  const ownerNpub = repoAddressAuthorNpub(address.authorHint);
  const ownerNip05 = repoAddressAuthorNip05(address.authorHint);

  const matches = ownerNpub
    ? ownerNpub === expectedPubkey
    : ownerNip05
      ? await verifyNip05({ nip05: ownerNip05, expectedPubkey })
      : false;

  if (!matches) {
    throw new Error(
      'Selected bunker signer does not match the repository owner identity.',
    );
  }
}

function activeNgitPubkey(pluginDir: string): string | null {
  const result = Bun.spawnSync(
    ['ngit', 'account', 'whoami', '--offline', '--json'],
    { cwd: pluginDir, stdout: 'pipe', stderr: 'pipe' },
  );

  if (result.exitCode !== 0) {
    return null;
  }

  try {
    const data = JSON.parse(result.stdout.toString()) as {
      active?: { npub?: unknown };
    };

    return typeof data.active?.npub === 'string'
      ? decodeNpub(data.active.npub)
      : null;
  } catch {
    return null;
  }
}

type PrepareFirstReleaseRepositoryProps = {
  dmBotRoot: string;
  alias: string;
  repo: string;
  pkg: PluginPackage;
  versionTag: string;
  authorPubkey: string;
};

async function prepareFirstReleaseRepository({
  dmBotRoot,
  alias,
  repo,
  pkg,
  versionTag,
  authorPubkey,
}: PrepareFirstReleaseRepositoryProps): Promise<void> {
  const pluginDir = join(dmBotRoot, 'plugins', alias);
  const state = await inspectPluginReleaseGit({ dmBotRoot, alias, versionTag });

  if (state.changedFileCount > 0) {
    throw new Error(
      `Plugin has ${state.changedFileCount} uncommitted file change(s). Commit them before publishing.`,
    );
  }

  if (state.branch === null) {
    throw new Error('Cannot publish a release from a detached HEAD.');
  }

  if (!state.localTagAtHead) {
    throw new Error(`${versionTag} does not point at the current commit.`);
  }

  await verifyRepositoryOwner({ repo, expectedPubkey: authorPubkey });

  if (activeNgitPubkey(pluginDir) !== authorPubkey) {
    throw new Error(
      'The active ngit account must match the selected bunker signer before repository publication.',
    );
  }

  const origin = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], {
    cwd: pluginDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (origin.exitCode !== 0) {
    const address = parseNostrRepoAddress(repo);

    if (!address) {
      throw new Error(`Invalid Nostr repository address: ${repo}`);
    }

    const existingRemote = Bun.spawnSync(['git', 'ls-remote', repo], {
      cwd: pluginDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    if (existingRemote.exitCode === 0) {
      const added = Bun.spawnSync(['git', 'remote', 'add', 'origin', repo], {
        cwd: pluginDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      if (added.exitCode !== 0) {
        throw new Error(
          `Failed to configure Nostr origin: ${added.stderr.toString().trim()}`,
        );
      }
    } else {
      const initArgs = [
        'ngit',
        'init',
        '--name',
        pkg.title,
        '--identifier',
        address.repoId,
        ...(pkg.description.trim()
          ? ['--description', pkg.description.trim()]
          : []),
        ...address.relayHints.flatMap((relay) => [
          '--grasp-server',
          relay.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
        ]),
        '--defaults',
      ];

      const initialized = Bun.spawnSync(initArgs, {
        cwd: pluginDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      if (initialized.exitCode !== 0) {
        throw new Error(
          `Failed to register Nostr repository: ${initialized.stderr.toString().trim() || initialized.stdout.toString().trim()}`,
        );
      }
    }
  }

  const pushed = Bun.spawnSync(
    ['git', 'push', 'origin', state.branch, '--tags'],
    { cwd: pluginDir, stdout: 'pipe', stderr: 'pipe' },
  );

  if (pushed.exitCode !== 0) {
    throw new Error(
      `Failed to push initial Nostr release: ${pushed.stderr.toString().trim()}`,
    );
  }
}

function readGitRemote({
  dmBotRoot,
  alias,
  fallbackRepo,
}: {
  dmBotRoot: string;
  alias: string;
  fallbackRepo: string;
}): string {
  const result = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], {
    cwd: join(dmBotRoot, 'plugins', alias),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    return fallbackRepo;
  }

  return result.stdout.toString().trim() || fallbackRepo;
}

function firstPublishRepository({
  installed,
  connection,
}: {
  installed: InstalledPluginEntry;
  connection: ConnectionRow;
}): string {
  if (!isLocalPluginRepo(installed.repo)) {
    return installed.repo;
  }

  return `nostr://${nip19.npubEncode(connection.data.userPubkey)}/relay.ngit.dev/${installed.alias}`;
}

function remoteTags(repo: string): Set<string> {
  const result = Bun.spawnSync(['git', 'ls-remote', '--tags', repo], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to fetch remote tags: ${result.stderr.toString()}`);
  }

  return new Set(
    result.stdout
      .toString()
      .split('\n')
      .filter((line) => line.includes('refs/tags/') && !line.includes('^{}'))
      .map((line) => line.split('refs/tags/')[1]?.trim())
      .filter((value): value is string => Boolean(value)),
  );
}

function verifyRemoteRefs({
  repo,
  refs,
}: {
  repo: string;
  refs: RefEntry[];
}): void {
  const tags = remoteTags(repo);
  const missing = refs.filter((ref) => !tags.has(ref.tag));

  if (missing.length > 0) {
    throw new Error(
      `Remote is missing tag(s): ${missing.map((ref) => ref.tag).join(', ')}`,
    );
  }
}

function fetchLocalTags(pluginDir: string): void {
  Bun.spawnSync(['git', 'fetch', '--tags'], {
    cwd: pluginDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

type GitCommitSubjectsProps = {
  pluginDir: string;
  fromTag: string | null;
  toTag: string;
};

function gitCommitSubjects({
  pluginDir,
  fromTag,
  toTag,
}: GitCommitSubjectsProps): string[] {
  const range = fromTag ? `${fromTag}..${toTag}` : toTag;

  const result = Bun.spawnSync(
    [
      'git',
      'log',
      `--max-count=${CHANGELOG_COMMIT_LIMIT}`,
      '--format=%s',
      range,
    ],
    {
      cwd: pluginDir,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .toString()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

type ChangelogFromCommitMessagesProps = {
  pluginDir: string;
  previousTag: string | null;
  versionTag: string;
};

function changelogFromCommitMessages({
  pluginDir,
  previousTag,
  versionTag,
}: ChangelogFromCommitMessagesProps): string {
  const subjects = gitCommitSubjects({
    pluginDir,
    fromTag: previousTag,
    toTag: versionTag,
  });

  return subjects.length > 0
    ? subjects.map((subject) => `• ${subject}`).join('\n')
    : `Release ${versionTag}`;
}

function isGeneratedFallbackChangelog(ref: RefEntry): boolean {
  const changelog = ref.changelog.trim();

  return (
    changelog.length === 0 ||
    changelog === `Release ${ref.tag}` ||
    /^Release v?\d+(?:\.\d+){0,2}/i.test(changelog)
  );
}

type RefsWithCommitChangelogsProps = {
  pluginDir: string;
  refs: RefEntry[];
};

function refsWithCommitChangelogs({
  pluginDir,
  refs,
}: RefsWithCommitChangelogsProps): RefEntry[] {
  return refs.map((ref, index) => {
    if (!isGeneratedFallbackChangelog(ref)) {
      return ref;
    }

    return {
      ...ref,
      changelog: changelogFromCommitMessages({
        pluginDir,
        previousTag: refs[index - 1]?.tag ?? null,
        versionTag: ref.tag,
      }),
    };
  });
}

function refsEqual(left: RefEntry[], right: RefEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every((ref, index) => {
      const rightRef = right[index];

      return (
        rightRef !== undefined &&
        ref.tag === rightRef.tag &&
        ref.coreApiVersion === rightRef.coreApiVersion &&
        ref.changelog === rightRef.changelog
      );
    })
  );
}

async function fetchPluginPublishRelays({
  ctx,
  authorPubkey,
}: {
  ctx: RouteCommandContext;
  authorPubkey: string;
}): Promise<string[]> {
  const relayList = await ctx.pool.get([...PROFILE_RELAYS_FOR_QUERY], {
    kinds: [NIP65_RELAY_LIST_KIND],
    authors: [authorPubkey],
    limit: 1,
  });

  if (!relayList) {
    return uniqueRelays(PLUGIN_PUBLISH_RELAYS);
  }

  const { writeRelays } = parseNip65RelayTags(relayList.tags);

  return uniqueRelays([
    ...(writeRelays.length > 0 ? writeRelays : []),
    ...PLUGIN_PUBLISH_RELAYS,
  ]);
}

function buildEventTemplate({
  pkg,
  repo,
  refs,
  iconUrl,
}: {
  pkg: PluginPackage;
  repo: string;
  refs: RefEntry[];
  iconUrl: string | null;
}): EventTemplate {
  return {
    kind: PLUGIN_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', pkg.name],
      ['title', pkg.title],
      ...(iconUrl
        ? [['icon', iconUrl, ...(pkg.iconPath ? [pkg.iconPath] : [])]]
        : []),
      ...(pkg.website ? [['website', pkg.website]] : []),
      ['repo', repo],
      ['version', `v${pkg.version}`],
      ['coreApiVersion', pkg.coreApiVersion],
      ['t', 'appweaver-plugin'],
      ...capabilityRelationTags(pkg.capabilities),
      ...refs.map((ref) => ['ref', ref.tag, ref.coreApiVersion, ref.changelog]),
    ],
    content: pkg.description,
  };
}

async function publishEvent({
  ctx,
  relays,
  event,
  connection,
}: {
  ctx: RouteCommandContext;
  relays: string[];
  event: NostrEvent;
  connection: ConnectionRow;
}): Promise<PublishRelayResult[]> {
  const results = await Promise.allSettled(
    ctx.pool.publish(relays, event, {
      onauth(authEvent) {
        return bunkerSignEvent(ctx.pool, connection.data, authEvent);
      },
    }),
  );

  return results.map((result, index) => ({
    relay: relays[index],
    ok: result.status === 'fulfilled',
    error: result.status === 'fulfilled' ? null : String(result.reason),
  }));
}

export async function handlePluginsPublish(
  ctx: RouteCommandContext,
): Promise<ReturnType<typeof renderPluginsPublishWeb> | string> {
  const alias = ctx.args[1]?.trim() ?? '';
  const signerName = requestedSignerName(ctx.args);

  if (!alias) {
    return `Usage: ${ctx.prefix}plugins publish <alias>`;
  }

  const installed = readInstalledPlugins(ctx.dmBotRoot).find(
    (entry) => entry.alias === alias,
  );

  if (!installed) {
    return `Plugin alias not found in plugins.json: ${alias}`;
  }

  const pkg = readPluginPackage({ dmBotRoot: ctx.dmBotRoot, alias });

  const published = findPublishedPlugin({
    installed,
    catalog: await queryPluginCatalog(ctx),
  });

  const connection = findAuthorConnection({ ctx, published, signerName });

  const versionTag = `v${pkg.version}`;

  const repo = published
    ? readGitRemote({
        dmBotRoot: ctx.dmBotRoot,
        alias,
        fallbackRepo: installed.repo,
      })
    : firstPublishRepository({ installed, connection });

  const pluginDir = join(ctx.dmBotRoot, 'plugins', alias);

  const icon = pkg.iconPath
    ? readPluginSvgIcon({ pluginDir, iconPath: pkg.iconPath })
    : null;

  fetchLocalTags(pluginDir);

  const refsWithBackfilledChangelogs = refsWithCommitChangelogs({
    pluginDir,
    refs: published?.refs ?? [],
  });

  const versionAlreadyPublished = refsWithBackfilledChangelogs.some(
    (ref) => ref.tag === versionTag,
  );

  if (
    published &&
    versionAlreadyPublished &&
    refsEqual(published.refs, refsWithBackfilledChangelogs) &&
    pluginMetadataMatchesPackage({
      dmBotRoot: ctx.dmBotRoot,
      alias,
      published,
    })
  ) {
    const representation = rememberPublishResult({
      alias,
      pluginName: pkg.name,
      versionTag,
      eventId: published.id,
      status: 'already-published',
      message: `${versionTag} is already present in the published ref history.`,
      relays: [],
    });

    return ctx.source === 'web'
      ? renderPluginsPublishWeb(representation)
      : renderPluginsPublishText(representation);
  }

  const previousRef = refsWithBackfilledChangelogs.at(-1) ?? null;

  const changelog = changelogFromCommitMessages({
    pluginDir,
    previousTag: previousRef?.tag ?? null,
    versionTag,
  });

  const refs = versionAlreadyPublished
    ? refsWithBackfilledChangelogs
    : [
        ...refsWithBackfilledChangelogs,
        {
          tag: versionTag,
          coreApiVersion: pkg.coreApiVersion,
          changelog,
        },
      ];

  if (ctx.source === 'web' && !publishConfirmed(ctx)) {
    const relays = await fetchPluginPublishRelays({
      ctx,
      authorPubkey: connection.data.userPubkey,
    });

    return renderPluginsPublishPreviewWeb({
      alias,
      pluginName: pkg.name,
      title: pkg.title,
      versionTag,
      signerName: connection.name,
      signerPubkey: connection.data.userPubkey,
      repo,
      iconPath: pkg.iconPath,
      website: pkg.website,
      coreApiVersion: pkg.coreApiVersion,
      capabilities: pkg.capabilities,
      description: pkg.description,
      refs,
      relays,
      firstPublish: published === null,
    });
  }

  if (published) {
    await pushPluginRelease({ dmBotRoot: ctx.dmBotRoot, alias, versionTag });
  }

  if (!published) {
    await prepareFirstReleaseRepository({
      dmBotRoot: ctx.dmBotRoot,
      alias,
      repo,
      pkg,
      versionTag,
      authorPubkey: connection.data.userPubkey,
    });
  }

  verifyRemoteRefs({ repo, refs });

  const iconUrl = icon
    ? await uploadPluginIcon({
        pool: ctx.pool,
        bunkerData: connection.data,
        icon,
      })
    : published?.iconUrl || null;

  const template = buildEventTemplate({ pkg, repo, refs, iconUrl });
  const signed = await bunkerSignEvent(ctx.pool, connection.data, template);

  const relays = await fetchPluginPublishRelays({
    ctx,
    authorPubkey: connection.data.userPubkey,
  });

  const relayResults = await publishEvent({
    ctx,
    relays,
    event: signed,
    connection,
  });

  const succeeded = relayResults.filter((result) => result.ok).length;
  let manifestUpdateError: string | null = null;

  if (succeeded > 0 && isLocalPluginRepo(installed.repo)) {
    try {
      setPluginRepository({ dmBotRoot: ctx.dmBotRoot, alias, repo });
    } catch (error) {
      manifestUpdateError =
        error instanceof Error ? error.message : String(error);
    }
  }

  const representation = rememberPublishResult({
    alias,
    pluginName: pkg.name,
    versionTag,
    eventId: signed.id,
    status: succeeded > 0 ? 'published' : 'failed',
    message:
      succeeded > 0
        ? `Published ${pkg.name} ${versionTag} to ${succeeded}/${relayResults.length} relay(s).${manifestUpdateError ? ` Update plugins.json manually to ${repo}: ${manifestUpdateError}` : ''}`
        : `Failed to publish ${pkg.name} ${versionTag}.`,
    relays: relayResults,
  });

  return ctx.source === 'web'
    ? renderPluginsPublishWeb(representation)
    : renderPluginsPublishText(representation);
}
