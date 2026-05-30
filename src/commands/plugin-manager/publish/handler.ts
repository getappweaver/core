import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import type { EventTemplate, NostrEvent } from 'nostr-tools';

import type { RouteCommandContext } from '@src/commands/dispatch';
import { ensureWss } from '@src/env';
import { bunkerSignEvent } from '@src/nostr/bunker';
import { listConnections, type ConnectionRow } from '@src/nostr/connections';
import {
  NIP65_RELAY_LIST_KIND,
  parseNip65RelayTags,
  PROFILE_RELAYS_FOR_QUERY,
} from '@src/nostr/nip65';

import {
  type InstalledPluginEntry,
  type PluginCatalogEntry,
  queryPluginCatalog,
  readInstalledPlugins,
  suggestedAlias,
} from '../install/handler';

import { renderPluginsPublishText } from './renderers/text';
import { renderPluginsPublishWeb } from './renderers/web';

const PLUGIN_KIND = 32107;

const PLUGIN_PUBLISH_RELAYS = [
  'wss://relay.damus.io',
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
  description: string;
  coreApiVersion: string;
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
      website?: unknown;
      description?: unknown;
      coreApiVersion?: unknown;
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

  return {
    name: pkg.name.trim(),
    version: pkg.version.trim(),
    title: pkg.appweaver.title.trim(),
    website:
      typeof pkg.appweaver.website === 'string' &&
      pkg.appweaver.website.trim().length > 0
        ? pkg.appweaver.website.trim()
        : null,
    description,
    coreApiVersion: pkg.appweaver.coreApiVersion.trim(),
  };
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

function findAuthorConnection({
  ctx,
  published,
}: {
  ctx: RouteCommandContext;
  published: PluginCatalogEntry;
}): ConnectionRow {
  const connection = listConnections(ctx.seenDb).find(
    (item) => item.data.userPubkey === published.pubkey,
  );

  if (!connection) {
    throw new Error(
      `No saved bunker connection matches published plugin author ${published.pubkey}.`,
    );
  }

  return connection;
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
    return PLUGIN_PUBLISH_RELAYS.map(ensureWss);
  }

  const { writeRelays } = parseNip65RelayTags(relayList.tags);

  return [
    ...new Set([
      ...(writeRelays.length > 0 ? writeRelays : []),
      ...PLUGIN_PUBLISH_RELAYS.map(ensureWss),
    ]),
  ];
}

function buildEventTemplate({
  pkg,
  published,
  repo,
  refs,
}: {
  pkg: PluginPackage;
  published: PluginCatalogEntry;
  repo: string;
  refs: RefEntry[];
}): EventTemplate {
  return {
    kind: PLUGIN_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', pkg.name],
      ['title', pkg.title],
      ...(published.icon ? [['icon', published.icon]] : []),
      ...(pkg.website ? [['website', pkg.website]] : []),
      ['repo', repo],
      ['version', `v${pkg.version}`],
      ['coreApiVersion', pkg.coreApiVersion],
      ['t', 'appweaver-plugin'],
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

  if (!published) {
    return `No published plugin event found for ${alias}. First publish still needs bun run plugin:publish.`;
  }

  const versionTag = `v${pkg.version}`;

  const repo = readGitRemote({
    dmBotRoot: ctx.dmBotRoot,
    alias,
    fallbackRepo: installed.repo,
  });

  const pluginDir = join(ctx.dmBotRoot, 'plugins', alias);

  fetchLocalTags(pluginDir);

  const refsWithBackfilledChangelogs = refsWithCommitChangelogs({
    pluginDir,
    refs: published.refs,
  });

  const versionAlreadyPublished = refsWithBackfilledChangelogs.some(
    (ref) => ref.tag === versionTag,
  );

  if (
    versionAlreadyPublished &&
    refsEqual(published.refs, refsWithBackfilledChangelogs)
  ) {
    const representation: PluginsPublishRepresentation = {
      alias,
      pluginName: pkg.name,
      versionTag,
      eventId: published.id,
      status: 'already-published',
      message: `${versionTag} is already present in the published ref history.`,
      relays: [],
    };

    return ctx.source === 'web'
      ? renderPluginsPublishWeb(representation)
      : renderPluginsPublishText(representation);
  }

  const connection = findAuthorConnection({ ctx, published });

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

  verifyRemoteRefs({ repo, refs });

  const template = buildEventTemplate({ pkg, published, repo, refs });
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

  const representation: PluginsPublishRepresentation = {
    alias,
    pluginName: pkg.name,
    versionTag,
    eventId: signed.id,
    status: succeeded > 0 ? 'published' : 'failed',
    message:
      succeeded > 0
        ? `Published ${pkg.name} ${versionTag} to ${succeeded}/${relayResults.length} relay(s).`
        : `Failed to publish ${pkg.name} ${versionTag}.`,
    relays: relayResults,
  };

  return ctx.source === 'web'
    ? renderPluginsPublishWeb(representation)
    : renderPluginsPublishText(representation);
}
