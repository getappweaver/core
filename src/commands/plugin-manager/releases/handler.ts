import { join, relative } from 'path';

import { nip19 } from 'nostr-tools';

import { handleBunkerList } from '@src/commands/bunker/list/handler';
import { monitoring } from '@src/core/monitoring';
import { resolveNip05Identity } from '@src/nostr/author-identity';
import {
  parseNostrRepoAddress,
  repoAddressAuthorNip05,
  repoAddressAuthorNpub,
} from '@src/nostr/repo-address';
import { isLocalPluginRepo } from '@src/plugin-lifecycle/manifest';

import type { RouteCommandContext } from '../../dispatch';

import {
  type InstalledPluginEntry,
  type PluginCatalogEntry,
  PLUGIN_QUERY_RELAYS,
  queryPluginCatalog,
  readInstalledPlugins,
  readLocalPluginPackageVersion,
  suggestedAlias,
} from '../install/handler';
import {
  latestPluginPublishResult,
  pluginMetadataMatchesPackage,
  type PluginsPublishRepresentation,
} from '../publish/handler';
import {
  inspectPluginReleaseGit,
  type PluginReleaseGitState,
} from '../release-git';

import { renderPluginsReleasesText } from './renderers/text';
import { renderPluginsReleasesWeb } from './renderers/web';

type AuthorSigner = {
  pubkey: string;
  label: string;
  source: 'bot' | 'bunker';
  connectionName: string | null;
};

export type PluginReleaseStatus =
  | 'local-draft'
  | 'not-published'
  | 'published-ok'
  | 'publish-needed'
  | 'metadata-publish-needed'
  | 'commit-needed'
  | 'tag-needed'
  | 'push-needed'
  | 'local-behind'
  | 'version-unknown';

export type PluginReleaseEntry = {
  installed: InstalledPluginEntry;
  localVersion: string | null;
  published: PluginCatalogEntry | null;
  authorSigner: AuthorSigner | null;
  publishSigners: AuthorSigner[];
  suggestedSignerName: string | null;
  git: PluginReleaseGitState;
  repositoryPath: string;
  lastPublish: PluginsPublishRepresentation | null;
  status: PluginReleaseStatus;
};

export type PluginsReleasesRepresentation = {
  relays: string[];
  signerCount: number;
  bunkerSignerCount: number;
  matchedSignerCount: number;
  installedCount: number;
  publishedCount: number;
  unpublishedCount: number;
  hiddenCount: number;
  entries: PluginReleaseEntry[];
};

function maskedNpub(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);

    return `${npub.slice(0, 12)}...${npub.slice(-6)}`;
  } catch {
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
  }
}

function uniqueSigners(signers: AuthorSigner[]): AuthorSigner[] {
  const seen = new Set<string>();

  return signers.filter((signer) => {
    if (seen.has(signer.pubkey)) {
      return false;
    }

    seen.add(signer.pubkey);

    return true;
  });
}

function authorSigners(ctx: RouteCommandContext): AuthorSigner[] {
  const signers: AuthorSigner[] = [];

  const bunkerList = handleBunkerList({ db: ctx.seenDb });

  if (bunkerList.data.view === 'list') {
    for (const item of bunkerList.data.items) {
      signers.push({
        pubkey: item.userPubkey,
        label: `bunker ${item.name}`,
        source: 'bunker',
        connectionName: item.name,
      });
    }
  }

  if (ctx.botPubkey) {
    signers.push({
      pubkey: ctx.botPubkey,
      label: `bot ${maskedNpub(ctx.botPubkey)}`,
      source: 'bot',
      connectionName: null,
    });
  }

  return uniqueSigners(signers);
}

function parseVersionParts(value: string): [number, number, number] | null {
  const match = value.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);

  if (!match) {
    return null;
  }

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2] ?? '0', 10),
    Number.parseInt(match[3] ?? '0', 10),
  ];
}

function compareVersions(left: string, right: string): number | null {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);

  if (!leftParts || !rightParts) {
    return null;
  }

  for (let i = 0; i < 3; i += 1) {
    if (leftParts[i] !== rightParts[i]) {
      return leftParts[i] - rightParts[i];
    }
  }

  return 0;
}

function releaseStatus(
  localVersion: string | null,
  published: PluginCatalogEntry,
  git: PluginReleaseGitState,
  metadataMatches: boolean,
): PluginReleaseStatus {
  if (!localVersion) {
    return 'version-unknown';
  }

  const compared = compareVersions(localVersion, published.version);

  if (compared === null) {
    return 'version-unknown';
  }

  if (compared === 0 && metadataMatches) {
    return 'published-ok';
  }

  if (compared < 0) {
    return 'local-behind';
  }

  if (git.changedFileCount > 0) {
    return 'commit-needed';
  }

  if (!git.localTagAtHead) {
    return 'tag-needed';
  }

  if (
    git.remotes.some(
      (remote) =>
        (remote.required || remote.configured) &&
        (!remote.branchReady || !remote.tagReady),
    )
  ) {
    return 'push-needed';
  }

  return compared === 0 ? 'metadata-publish-needed' : 'publish-needed';
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

function latestPublishedPlugin(
  installed: InstalledPluginEntry,
  catalog: PluginCatalogEntry[],
): PluginCatalogEntry | null {
  return (
    catalog
      .filter((entry) => pluginMatchesInstalled(installed, entry))
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}

async function repositoryAuthorPubkey(repo: string): Promise<string | null> {
  const address = parseNostrRepoAddress(repo);

  if (!address) {
    return null;
  }

  const npub = repoAddressAuthorNpub(address.authorHint);

  if (npub) {
    return npub;
  }

  const nip05 = repoAddressAuthorNip05(address.authorHint);

  return nip05 ? ((await resolveNip05Identity(nip05))?.pubkey ?? null) : null;
}

type MatchPublishedPluginProps = {
  installed: InstalledPluginEntry;
  catalog: PluginCatalogEntry[];
  signers: AuthorSigner[];
};

function matchPublishedPlugin({
  installed,
  catalog,
  signers,
}: MatchPublishedPluginProps): {
  published: PluginCatalogEntry;
  signer: AuthorSigner;
} | null {
  const candidates = catalog
    .filter((entry) => pluginMatchesInstalled(installed, entry))
    .map((entry) => ({
      published: entry,
      signer: signers.find((signer) => signer.pubkey === entry.pubkey) ?? null,
    }))
    .filter(
      (
        entry,
      ): entry is { published: PluginCatalogEntry; signer: AuthorSigner } =>
        entry.signer !== null,
    )
    .sort((a, b) => b.published.createdAt - a.published.createdAt);

  return candidates[0] ?? null;
}

export async function handlePluginsReleases(
  ctx: RouteCommandContext,
): Promise<ReturnType<typeof renderPluginsReleasesWeb> | string> {
  return monitoring.withSpan({
    name: 'plugins.releases.handle',
    attributes: { source: ctx.source },
    parent: null,
    run: async () => {
      const spanInstalled = monitoring.startSpan({
        name: 'plugins.releases.readInstalled',
        attributes: {},
        parent: null,
      });

      const aliasFromArgs = (() => {
        const idx = ctx.args.indexOf('--alias');

        if (idx >= 0) {
          return ctx.args[idx + 1]?.trim() ?? '';
        }

        // Backward compat: /plugins releases todo (positional)
        const subcommands = ['releases', 'release', 'publish-status'];

        const candidates = ctx.args.filter(
          (arg) => !arg.startsWith('--') && !subcommands.includes(arg),
        );

        return candidates[0]?.trim() ?? '';
      })();

      const aliasFilterRaw =
        aliasFromArgs ||
        (
          (ctx.jsonPayload as { arguments?: { alias?: unknown } } | null)
            ?.arguments?.alias as string | undefined
        )?.trim() ||
        (
          (ctx.jsonPayload as { options?: { alias?: unknown } } | null)?.options
            ?.alias as string | undefined
        )?.trim() ||
        '';

      const aliasFilter = aliasFilterRaw || null;

      const allInstalled = readInstalledPlugins(ctx.dmBotRoot);

      const installedPlugins = aliasFilter
        ? allInstalled.filter((entry) => entry.alias === aliasFilter)
        : allInstalled;

      spanInstalled.end();

      if (aliasFilter && installedPlugins.length === 0) {
        return `Plugin alias not found in plugins.json: ${aliasFilter}`;
      }

      const spanCatalog = monitoring.startSpan({
        name: 'plugins.releases.queryCatalog',
        attributes: { installedCount: installedPlugins.length },
        parent: null,
      });

      const catalog = await queryPluginCatalog(ctx, undefined, undefined, {
        skipIcons: true,
      });

      spanCatalog.end();

      const spanSigners = monitoring.startSpan({
        name: 'plugins.releases.authorSigners',
        attributes: {},
        parent: null,
      });

      const signers = authorSigners(ctx);

      const bunkerSigners = signers.filter(
        (signer) => signer.source === 'bunker',
      );

      spanSigners.end();

      const spanResolve = monitoring.startSpan({
        name: 'plugins.releases.resolveEntries',
        attributes: { installedCount: installedPlugins.length },
        parent: null,
      });

      const resolvedEntries = await Promise.all(
        installedPlugins.map(
          async (installed): Promise<PluginReleaseEntry | null> => {
            const entrySpan = monitoring.startSpan({
              name: 'plugins.releases.resolveEntry',
              attributes: { alias: installed.alias },
              parent: null,
            });

            const match = matchPublishedPlugin({
              installed,
              catalog,
              signers,
            });

            const published = latestPublishedPlugin(installed, catalog);

            if (published && !match) {
              entrySpan.end();

              return null;
            }

            const localVersion = readLocalPluginPackageVersion({
              dmBotRoot: ctx.dmBotRoot,
              alias: installed.alias,
            });

            const versionTag = localVersion ? `v${localVersion}` : 'v0.0.0';

            const git = await inspectPluginReleaseGit({
              dmBotRoot: ctx.dmBotRoot,
              alias: installed.alias,
              versionTag,
            });

            const pluginDir = join(ctx.dmBotRoot, 'plugins', installed.alias);

            const expectedAuthorPubkey = published
              ? published.pubkey
              : await repositoryAuthorPubkey(installed.repo);

            const publishSigners = bunkerSigners.filter(
              (signer) =>
                expectedAuthorPubkey === null ||
                signer.pubkey === expectedAuthorPubkey,
            );

            const status = match
              ? (() => {
                  const spanMeta = monitoring.startSpan({
                    name: 'plugins.releases.metadataMatch',
                    attributes: { alias: installed.alias },
                    parent: null,
                  });

                  const matches = pluginMetadataMatchesPackage({
                    dmBotRoot: ctx.dmBotRoot,
                    alias: installed.alias,
                    published: match.published,
                  });

                  spanMeta.end();

                  return releaseStatus(
                    localVersion,
                    match.published,
                    git,
                    matches,
                  );
                })()
              : isLocalPluginRepo(installed.repo)
                ? 'local-draft'
                : 'not-published';

            entrySpan.end();

            return {
              installed,
              localVersion,
              published: match?.published ?? null,
              authorSigner: match?.signer ?? null,
              publishSigners,
              suggestedSignerName: publishSigners[0]?.connectionName ?? null,
              git,
              repositoryPath: relative(ctx.cwd, pluginDir).replace(/\\/g, '/'),
              lastPublish: latestPluginPublishResult(installed.alias),
              status,
            };
          },
        ),
      );

      spanResolve.end();

      const entries = resolvedEntries.filter(
        (entry): entry is PluginReleaseEntry => entry !== null,
      );

      const publishedEntries = entries.filter(
        (entry) => entry.published !== null,
      );

      const unpublishedEntries = entries.filter(
        (entry) => entry.published === null,
      );

      const representation: PluginsReleasesRepresentation = {
        relays: PLUGIN_QUERY_RELAYS,
        signerCount: signers.length,
        bunkerSignerCount: bunkerSigners.length,
        matchedSignerCount: new Set(
          publishedEntries.flatMap((entry) =>
            entry.authorSigner ? [entry.authorSigner.pubkey] : [],
          ),
        ).size,
        installedCount: installedPlugins.length,
        publishedCount: publishedEntries.length,
        unpublishedCount: unpublishedEntries.length,
        hiddenCount: installedPlugins.length - entries.length,
        entries,
      };

      if (ctx.source === 'web') {
        return renderPluginsReleasesWeb(representation);
      }

      return renderPluginsReleasesText(representation, { prefix: ctx.prefix });
    },
  });
}
