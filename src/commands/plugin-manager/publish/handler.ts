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
import { getState, setState } from '@src/db';
import { decodeNpub, verifyNip05 } from '@src/nostr/author-identity';
import { extractSha256FromUrl } from '@src/nostr/blossom';
import {
  bunkerSignEventWithProgress,
  type BunkerProgress,
} from '@src/nostr/bunker';
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
import type { WebNodeRoot } from '@src/web/ui-schema';

import { rememberCatalogDestinations } from '../catalog-destinations';
import {
  type InstalledPluginEntry,
  type PluginCatalogEntry,
  queryPluginCatalog,
  readInstalledPlugins,
  suggestedAlias,
} from '../install/handler';
import {
  inspectPluginReleaseGit,
  pushPluginRelease,
  type PushRemoteResult,
} from '../release-git';

import { managePaymentOffers, publicationOperation } from './offers';
import { publicationProgress } from './progress';
import { renderPluginsPublishText } from './renderers/text';
import {
  renderPluginsPublishPreviewWeb,
  renderPluginsPublishWeb,
  renderPublishRepositorySelection,
} from './renderers/web';
import {
  collectPublishRemotes,
  gitRepositoryChoices,
  sameRepository,
  selectPublicationRepository,
} from './repository';

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
  registrationError: string | null;
  registrationRepo: string | null;
  discoveryError: string | null;
  diagnostics: string | null;
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
  offerManagement: WebNodeRoot | null;
  catalogEditor: {
    title: string;
    website: string;
    description: string;
    tags: string[];
    existingCatalogTags: string[];
  } | null;
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
      accounts?: { active?: unknown; npub?: unknown }[];
    };

    const npub = Array.isArray(data.accounts)
      ? data.accounts.find((account) => account?.active === true)?.npub
      : data.active?.npub;

    return typeof npub === 'string' ? decodeNpub(npub) : null;
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

type PublicationProcessProps = { args: string[]; cwd: string | null };

async function publicationProcess({ args, cwd }: PublicationProcessProps) {
  const process = Bun.spawn(args, {
    ...(cwd ? { cwd } : {}),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  return { stdout, stderr, exitCode };
}

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

    const existingRemote = await publicationProcess({
      args: ['git', 'ls-remote', repo],
      cwd: pluginDir,
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

      const initialized = await publicationProcess({
        args: initArgs,
        cwd: pluginDir,
      });

      if (initialized.exitCode !== 0) {
        throw new Error(
          `Failed to register Nostr repository: ${initialized.stderr.toString().trim() || initialized.stdout.toString().trim()}`,
        );
      }
    }
  }

  const pushed = await publicationProcess({
    args: ['git', 'push', repo, state.branch, '--tags'],
    cwd: pluginDir,
  });

  if (pushed.exitCode !== 0) {
    throw new Error(
      `Failed to push initial Nostr release: ${pushed.stderr.toString().trim()}`,
    );
  }
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

async function remoteTags(repo: string): Promise<Set<string>> {
  const result = await publicationProcess({
    args: ['git', 'ls-remote', '--tags', repo],
    cwd: null,
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

async function verifyRemoteRefs({
  repo,
  refs,
}: {
  repo: string;
  refs: RefEntry[];
}): Promise<void> {
  const tags = await remoteTags(repo);
  const missing = refs.filter((ref) => !tags.has(ref.tag));

  if (missing.length > 0) {
    throw new Error(
      `Remote is missing tag(s): ${missing.map((ref) => ref.tag).join(', ')}`,
    );
  }
}

async function fetchLocalTags(pluginDir: string): Promise<void> {
  await publicationProcess({
    args: ['git', 'fetch', '--tags'],
    cwd: pluginDir,
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

function parseCatalogTags(raw: unknown): string[] {
  if (typeof raw !== 'string') {
    return [];
  }

  return [
    ...new Set(
      raw
        .split(',')
        .map((item) => item.trim().toLowerCase().replace(/^#+/, ''))
        .filter((item) => item.length > 0 && item !== 'appweaver-plugin'),
    ),
  ];
}

function buildEventTemplate({
  pkg,
  repos,
  refs,
  iconUrl,
  offerTag,
  tags,
  titleOverride,
  websiteOverride,
  descriptionOverride,
}: {
  pkg: PluginPackage;
  repos: string[];
  refs: RefEntry[];
  iconUrl: string | null;
  offerTag: string[] | null;
  tags: string[];
  titleOverride: string | null;
  websiteOverride: string | null;
  descriptionOverride: string | null;
}): EventTemplate {
  const title = titleOverride ?? pkg.title;
  const website = websiteOverride ?? pkg.website ?? '';
  const description = descriptionOverride ?? pkg.description;

  return {
    kind: PLUGIN_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', pkg.name],
      ['title', title],
      ...(iconUrl
        ? [['icon', iconUrl, ...(pkg.iconPath ? [pkg.iconPath] : [])]]
        : []),
      ...(website ? [['website', website]] : []),
      ...repos.map((repo) => ['repo', repo]),
      ['version', `v${pkg.version}`],
      ['coreApiVersion', pkg.coreApiVersion],
      ['t', 'appweaver-plugin'],
      ...tags.map((tag) => ['t', tag]),
      ...(offerTag ? [offerTag] : []),
      ...capabilityRelationTags(pkg.capabilities),
      ...refs.map((ref) => ['ref', ref.tag, ref.coreApiVersion, ref.changelog]),
    ],
    content: description,
  };
}

type PublishEventProps = {
  ctx: RouteCommandContext;
  relays: string[];
  event: NostrEvent;
  connection: ConnectionRow;
  progress: ReturnType<typeof publicationProgress>;
};

async function publishEvent({
  ctx,
  relays,
  event,
  connection,
  progress,
}: PublishEventProps): Promise<PublishRelayResult[]> {
  const results = await Promise.allSettled(
    ctx.pool
      .publish(relays, event, {
        onauth(authEvent) {
          return bunkerSignEventWithProgress({
            pool: ctx.pool,
            data: connection.data,
            event: authEvent,
            onProgress: (message, severity) =>
              progress.update({
                state: 'pending',
                diagnostic: severity === 'info' ? null : severity,
                message: `Catalog relay authentication (kind ${authEvent.kind}): ${message}`,
              }),
          });
        },
      })
      .map(async (promise, index) => {
        try {
          const result = await promise;

          progress.update({
            state: 'pending',
            message: `Catalog ${relays[index]}: accepted ${event.id}`,
            diagnostic: null,
          });

          return result;
        } catch (error) {
          progress.update({
            state: 'pending',
            message: `Catalog ${relays[index]}: ${String(error)}`,
            diagnostic: 'warning',
          });

          throw error;
        }
      }),
  );

  return results.map((result, index) => ({
    relay: relays[index],
    ok: result.status === 'fulfilled',
    error: result.status === 'fulfilled' ? null : String(result.reason),
  }));
}

type RegistrationReceipt = {
  alias: string;
  pluginName: string;
  versionTag: string;
  eventId: string;
  repo: string;
  previousRepo: string;
};

function reconcileRegistration(
  ctx: RouteCommandContext,
  receipt: RegistrationReceipt,
): string | null {
  try {
    // Retain proof of which successful publication this local-only retry belongs to.
    setState(
      ctx.seenDb,
      `plugins.publication-registration.${receipt.alias}`,
      JSON.stringify(receipt),
    );

    const current = readInstalledPlugins(ctx.dmBotRoot).find(
      (entry) => entry.alias === receipt.alias,
    );

    if (
      !current ||
      (current.repo !== receipt.previousRepo &&
        !sameRepository(current.repo, receipt.repo))
    ) {
      throw new Error(
        'Plugin registration changed since publication. Reopen release review.',
      );
    }

    if (!sameRepository(current.repo, receipt.repo)) {
      setPluginRepository({
        dmBotRoot: ctx.dmBotRoot,
        alias: receipt.alias,
        repo: receipt.repo,
      });
    }

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function requestedRepository(ctx: RouteCommandContext): string | null {
  const index = ctx.args.indexOf('--repo');

  if (index >= 0) {
    return ctx.args[index + 1]?.trim() || null;
  }

  const payload = ctx.jsonPayload as { options?: { repo?: unknown } } | null;

  return typeof payload?.options?.repo === 'string'
    ? payload.options.repo.trim() || null
    : null;
}

export async function handlePluginsPublish(
  ctx: RouteCommandContext,
): Promise<ReturnType<typeof renderPluginsPublishWeb> | string> {
  const progress = publicationProgress(ctx, publishConfirmed(ctx));
  const alias = ctx.args[1]?.trim() ?? '';

  if (publishConfirmed(ctx)) {
    latestPublishResults.delete(alias);
  }

  try {
    const result = await handlePluginsPublishAttempt(ctx, progress);

    if (ctx.source === 'web' && typeof result === 'string') {
      throw new Error(result);
    }

    return result;
  } catch (error) {
    const message = `Publication incomplete during ${progress.currentMessage()}: ${error instanceof Error ? error.message : String(error)}. Git push or icon upload may already have completed; review diagnostics before retrying.`;
    progress.update({ state: 'error', message, diagnostic: 'error' });

    const result = rememberPublishResult({
      alias,
      pluginName: alias,
      versionTag: '',
      eventId: null,
      status: 'failed',
      message,
      relays: [],
      registrationError: null,
      registrationRepo: null,
      discoveryError: null,
      diagnostics: progress.history(),
    });

    return ctx.source === 'web'
      ? renderPluginsPublishWeb(result)
      : renderPluginsPublishText(result);
  } finally {
    await progress.stop();
  }
}

async function handlePluginsPublishAttempt(
  ctx: RouteCommandContext,
  progress: ReturnType<typeof publicationProgress>,
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

  if (publicationOperation(ctx) === 'registration-retry') {
    const raw = getState(
      ctx.seenDb,
      `plugins.publication-registration.${alias}`,
    );

    if (!raw) {
      throw new Error(
        'No successful publication registration is available to retry.',
      );
    }

    const receipt = JSON.parse(raw) as RegistrationReceipt;

    if (
      receipt.alias !== alias ||
      receipt.pluginName !== pkg.name ||
      !receipt.eventId ||
      !receipt.repo ||
      !receipt.previousRepo ||
      !receipt.versionTag
    ) {
      throw new Error(
        'Stored publication registration does not match this plugin.',
      );
    }

    const error = reconcileRegistration(ctx, receipt);

    const result = rememberPublishResult({
      alias,
      pluginName: receipt.pluginName,
      versionTag: receipt.versionTag,
      eventId: receipt.eventId,
      status: 'already-published',
      relays: [],
      message: error
        ? `Published; local registration update failed: ${error}`
        : `Published release registered at ${receipt.repo}. No publication was repeated.`,
      registrationError: error,
      registrationRepo: receipt.repo,
      discoveryError: null,
      diagnostics: null,
    });

    return ctx.source === 'web'
      ? renderPluginsPublishWeb(result)
      : renderPluginsPublishText(result);
  }

  progress.update({
    state: 'pending',
    message: 'Loading current catalog and author identity',
    diagnostic: null,
  });

  const catalog = await queryPluginCatalog(ctx, undefined, undefined, {
    skipIcons: true,
  });

  const published = findPublishedPlugin({
    installed,
    catalog,
  });

  const existingCatalogTags = [
    ...new Set(catalog.flatMap((entry) => entry.tags)),
  ].sort((a, b) => a.localeCompare(b));

  const connection = findAuthorConnection({ ctx, published, signerName });

  const report = (message: string) =>
    progress.update({ state: 'pending', message, diagnostic: null });

  const reportSigning: BunkerProgress = (message, severity) =>
    progress.update({
      state: 'pending',
      message,
      diagnostic: severity === 'info' ? null : severity,
    });

  const operation = publicationOperation(ctx);

  if (operation) {
    if (ctx.source !== 'web' || !published) {
      return 'Catalog and offer management require an existing published catalog and the web UI.';
    }

    if (
      ![
        'offer-review',
        'offer-publish',
        'offer-select',
        'offer-cancel',
        'catalog-update',
      ].includes(operation)
    ) {
      return 'Unknown publication operation.';
    }
  }

  if (operation === 'catalog-update' && published) {
    const formOptions = publicationOptions(ctx);

    const title =
      typeof formOptions.title === 'string' && formOptions.title.trim()
        ? formOptions.title.trim()
        : published.title || pkg.title;

    const website =
      typeof formOptions.website === 'string'
        ? formOptions.website.trim()
        : published.website;

    const description =
      typeof formOptions.description === 'string' &&
      formOptions.description.trim()
        ? formOptions.description.trim()
        : published.description || pkg.description;

    const tags =
      formOptions.tags !== undefined
        ? parseCatalogTags(formOptions.tags)
        : published.tags;

    const existingEvent = published.catalogEvent;

    const template: EventTemplate = {
      kind: PLUGIN_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', published.name],
        ['title', title],
        ...(published.iconUrl
          ? [
              [
                'icon',
                published.iconUrl,
                ...(published.iconSource ? [published.iconSource] : []),
              ],
            ]
          : []),
        ...(website ? [['website', website]] : []),
        ...published.repos.map((entryRepo) => ['repo', entryRepo]),
        ['version', published.version],
        ['coreApiVersion', published.coreApiVersion],
        ['t', 'appweaver-plugin'],
        ...tags.map((tag) => ['t', tag]),
        ...(existingEvent?.tags.find((tag) => tag[0] === 'offer')
          ? [existingEvent.tags.find((tag) => tag[0] === 'offer')!]
          : []),
        ...capabilityRelationTags(published.capabilities),
        ...published.refs.map((ref) => [
          'ref',
          ref.tag,
          ref.coreApiVersion,
          ref.changelog,
        ]),
      ],
      content: description,
    };

    report('Waiting for catalog signature (kind 32107) via NIP-46');

    const signed = await bunkerSignEventWithProgress({
      pool: ctx.pool,
      data: connection.data,
      event: template,
      onProgress: (message, severity) =>
        reportSigning(
          `Bunker ${connection.name} (${nip19.npubEncode(connection.data.userPubkey)}) · catalog signature (kind 32107): ${message}`,
          severity,
        ),
    });

    const relays = await fetchPluginPublishRelays({
      ctx,
      authorPubkey: connection.data.userPubkey,
    });

    const relayResults = await publishEvent({
      ctx,
      relays,
      event: signed,
      connection,
      progress,
    });

    const succeeded = relayResults.filter((result) => result.ok).length;

    const representation = rememberPublishResult({
      alias,
      pluginName: published.name,
      versionTag: published.version,
      eventId: signed.id,
      status: succeeded > 0 ? 'published' : 'failed',
      message:
        succeeded > 0
          ? `Updated catalog for ${published.name} on ${succeeded}/${relayResults.length} relay(s).`
          : `Failed to update catalog for ${published.name}.`,
      relays: relayResults,
      registrationError: null,
      registrationRepo: null,
      discoveryError: null,
      diagnostics: progress.history(),
    });

    progress.update({
      state:
        succeeded === 0
          ? 'error'
          : succeeded < relayResults.length
            ? 'warning'
            : 'success',
      diagnostic:
        succeeded === 0
          ? 'error'
          : succeeded < relayResults.length
            ? 'warning'
            : null,
      message: representation.message,
    });

    representation.diagnostics = progress.history();

    return renderPluginsPublishWeb(representation);
  }

  const versionTag = `v${pkg.version}`;

  const pluginDir = join(ctx.dmBotRoot, 'plugins', alias);
  const choices = gitRepositoryChoices(pluginDir);
  const fallbackRepo = firstPublishRepository({ installed, connection });

  const selected = selectPublicationRepository({
    choices,
    installedRepo: installed.repo,
    publishedRepo: published?.repo ?? null,
    fallbackRepo,
    requestedRepo: requestedRepository(ctx),
  });

  const repo = selected.repo;

  if (selected.needsSelection && !operation) {
    if (ctx.source !== 'web') {
      return `Choose a publication repository with --repo <URL>.\n${choices.map((choice) => `${choice.name}: ${choice.repo}`).join('\n')}\nRegistered: ${installed.repo}\nCatalog: ${published?.repo ?? '(none)'}`;
    }

    return renderPublishRepositorySelection({
      alias,
      signerName: connection.name,
      choices,
      installedRepo: installed.repo,
      publishedRepo: published?.repo ?? null,
      fallbackRepo,
      preferredRepo: repo,
    });
  }

  const icon = pkg.iconPath
    ? readPluginSvgIcon({ pluginDir, iconPath: pkg.iconPath })
    : null;

  report('Fetching Git tags for release review');
  await fetchLocalTags(pluginDir);

  const refsWithBackfilledChangelogs = refsWithCommitChangelogs({
    pluginDir,
    refs: published?.refs ?? [],
  });

  const versionAlreadyPublished = refsWithBackfilledChangelogs.some(
    (ref) => ref.tag === versionTag,
  );

  if (
    published &&
    sameRepository(published.repo, repo) &&
    versionAlreadyPublished &&
    refsEqual(published.refs, refsWithBackfilledChangelogs) &&
    pluginMetadataMatchesPackage({
      dmBotRoot: ctx.dmBotRoot,
      alias,
      published,
    })
  ) {
    const registrationError = reconcileRegistration(ctx, {
      alias,
      pluginName: pkg.name,
      versionTag,
      eventId: published.id,
      repo,
      previousRepo: installed.repo,
    });

    const representation = rememberPublishResult({
      alias,
      pluginName: pkg.name,
      versionTag,
      eventId: published.id,
      status: 'already-published',
      message: registrationError
        ? `Published; local registration update failed: ${registrationError}`
        : `${versionTag} is already present in the published ref history. Local repository registration is up to date.`,
      relays: [],
      registrationError,
      registrationRepo: repo,
      discoveryError: null,
      diagnostics: null,
    });

    if (ctx.source === 'web' && !publishConfirmed(ctx) && !registrationError) {
      const relays = await fetchPluginPublishRelays({
        ctx,
        authorPubkey: published.pubkey,
      });

      return managePaymentOffers({
        ctx,
        alias,
        published,
        connection,
        relays,
      });
    }

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

    const offerManagement = published
      ? await managePaymentOffers({
          ctx,
          alias,
          published,
          connection,
          relays,
        })
      : null;

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
      offerManagement,
      catalogEditor: published
        ? {
            title: published.title || pkg.title,
            website: published.website || pkg.website || '',
            description: published.description || pkg.description,
            tags: published.tags,
            existingCatalogTags,
          }
        : null,
    });
  }

  const allRemotes = collectPublishRemotes({ choices, primaryRepo: repo });
  const pushResults: PushRemoteResult[] = [];

  if (published) {
    report(
      allRemotes.length > 1
        ? `Pushing to ${allRemotes.length} remotes`
        : `Pushing Git release ${versionTag} to ${repo}`,
    );

    pushResults.push(
      ...(await pushPluginRelease({
        dmBotRoot: ctx.dmBotRoot,
        alias,
        versionTag,
        primaryRepo: repo,
        repos: allRemotes,
      })),
    );
  }

  if (!published) {
    report(`Preparing first Git release ${versionTag} at ${repo}`);

    await prepareFirstReleaseRepository({
      dmBotRoot: ctx.dmBotRoot,
      alias,
      repo,
      pkg,
      versionTag,
      authorPubkey: connection.data.userPubkey,
    });

    pushResults.push({ repo, ok: true, error: null });

    if (allRemotes.length > 1) {
      const mirrors = allRemotes.slice(1);
      report(`Pushing to ${mirrors.length} mirror remote(s)`);

      pushResults.push(
        ...(await pushPluginRelease({
          dmBotRoot: ctx.dmBotRoot,
          alias,
          versionTag,
          primaryRepo: null,
          repos: mirrors,
        })),
      );
    }
  }

  report('Verifying remote Git tags');
  await verifyRemoteRefs({ repo, refs });

  const verifiedRepos: string[] = [repo];
  const mirrorWarnings: string[] = [];

  for (const result of pushResults) {
    if (result.repo === repo) {
      continue;
    }

    if (!result.ok) {
      const warning = `${result.repo}: ${result.error ?? 'push failed'}`;
      mirrorWarnings.push(warning);

      progress.update({
        state: 'pending',
        diagnostic: 'warning',
        message: `Mirror push failed (continuing): ${warning}`,
      });

      continue;
    }

    try {
      await verifyRemoteRefs({ repo: result.repo, refs });
      verifiedRepos.push(result.repo);
    } catch (error) {
      const warning = `${result.repo}: ${error instanceof Error ? error.message : String(error)}`;
      mirrorWarnings.push(warning);

      progress.update({
        state: 'pending',
        diagnostic: 'warning',
        message: `Mirror tag check failed (excluding from catalog): ${warning}`,
      });
    }
  }

  if (allRemotes.length > 1) {
    report(
      `Git release ${versionTag} pushed to ${verifiedRepos.length}/${allRemotes.length} remotes`,
    );
  } else {
    report(`Git release ${versionTag} pushed and verified`);
  }

  report(
    `Signing account: bunker ${connection.name} · ${nip19.npubEncode(connection.data.userPubkey)}; signer ${connection.data.remoteSignerPubkey}`,
  );

  const iconHash = icon
    ? new Bun.CryptoHasher('sha256').update(icon.data).digest('hex')
    : null;

  const reuseIcon = !!(
    icon &&
    published?.iconUrl &&
    published.iconSource === icon.path &&
    extractSha256FromUrl(published.iconUrl) === iconHash
  );

  report(
    reuseIcon
      ? 'Reusing unchanged published icon; no icon authorization needed'
      : 'Preparing icon upload and Blossom authorization',
  );

  const iconUrl =
    icon && !reuseIcon
      ? await uploadPluginIcon({
          pool: ctx.pool,
          bunkerData: connection.data,
          icon,
          onProgress: (message, severity) =>
            reportSigning(
              `Bunker ${connection.name} (${nip19.npubEncode(connection.data.userPubkey)}): ${message}`,
              severity,
            ),
        })
      : published?.iconUrl || null;

  const template = buildEventTemplate({
    pkg,
    repos: verifiedRepos,
    refs,
    iconUrl,
    offerTag:
      published?.catalogEvent?.tags.find((tag) => tag[0] === 'offer') ?? null,
    tags: published?.tags ?? [],
    titleOverride: null,
    websiteOverride: null,
    descriptionOverride: null,
  });

  report('Waiting for catalog signature (kind 32107) via NIP-46');

  const signed = await bunkerSignEventWithProgress({
    pool: ctx.pool,
    data: connection.data,
    event: template,
    onProgress: (message, severity) =>
      reportSigning(
        `Bunker ${connection.name} (${nip19.npubEncode(connection.data.userPubkey)}) · catalog signature (kind 32107): ${message}`,
        severity,
      ),
  });

  report('Discovering catalog publication destinations');

  const relays = await fetchPluginPublishRelays({
    ctx,
    authorPubkey: connection.data.userPubkey,
  });

  const relayResults = await publishEvent({
    ctx,
    relays,
    event: signed,
    connection,
    progress,
  });

  const succeeded = relayResults.filter((result) => result.ok).length;
  let manifestUpdateError: string | null = null;
  let discoveryError: string | null = null;

  if (succeeded > 0) {
    const acceptingRelays = relayResults
      .filter((result) => result.ok)
      .map((result) => result.relay);

    try {
      rememberCatalogDestinations(ctx.seenDb, acceptingRelays);
    } catch (error) {
      discoveryError = `Could not save catalog destinations: ${String(error)}`;
    }

    report(`Verifying exact catalog event ${signed.id} on accepting relays`);
    try {
      const found = await ctx.pool.get(
        acceptingRelays,
        { ids: [signed.id] },
        { maxWait: 5000 },
      );

      if (found?.id !== signed.id) {
        discoveryError = [
          discoveryError,
          'Relays accepted the catalog, but read-back did not find the exact event within 5s.',
        ]
          .filter(Boolean)
          .join(' ');
      } else {
        report(`Catalog read-back verified: ${signed.id}`);
      }
    } catch (error) {
      discoveryError = [
        discoveryError,
        `Catalog accepted; read-back failed: ${String(error)}`,
      ]
        .filter(Boolean)
        .join(' ');
    }

    manifestUpdateError = reconcileRegistration(ctx, {
      alias,
      pluginName: pkg.name,
      versionTag,
      eventId: signed.id,
      repo,
      previousRepo: installed.repo,
    });
  }

  const mirrorWarningSuffix =
    mirrorWarnings.length > 0
      ? ` Mirror warnings (${mirrorWarnings.length}): ${mirrorWarnings.join('; ')}.`
      : '';

  const representation = rememberPublishResult({
    alias,
    pluginName: pkg.name,
    versionTag,
    eventId: signed.id,
    status: succeeded > 0 ? 'published' : 'failed',
    message:
      succeeded > 0
        ? `Published ${pkg.name} ${versionTag} to ${succeeded}/${relayResults.length} relay(s) (${verifiedRepos.length}/${allRemotes.length} remote(s)). ${discoveryError ?? 'Exact catalog event read-back verified.'}${manifestUpdateError ? ` Published; local registration update failed: ${manifestUpdateError}` : ` Registered repository: ${repo}.`}${mirrorWarningSuffix}`
        : `Failed to publish ${pkg.name} ${versionTag}.`,
    relays: relayResults,
    registrationError: manifestUpdateError,
    registrationRepo: succeeded > 0 ? repo : null,
    discoveryError,
    diagnostics: progress.history(),
  });

  const outcomeState =
    succeeded === 0
      ? 'error'
      : discoveryError ||
          manifestUpdateError ||
          mirrorWarnings.length > 0 ||
          succeeded < relayResults.length
        ? 'warning'
        : 'success';

  progress.update({
    state: outcomeState,
    diagnostic: outcomeState === 'success' ? null : outcomeState,
    message: representation.message,
  });

  representation.diagnostics = progress.history();

  return ctx.source === 'web'
    ? renderPluginsPublishWeb(representation)
    : renderPluginsPublishText(representation);
}
