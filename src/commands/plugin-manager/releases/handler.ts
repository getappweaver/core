import { join, relative } from 'path';

import { nip19 } from 'nostr-tools';

import { capabilityRelationsEqual } from '@src/capabilities/relations';
import { handleBunkerList } from '@src/commands/bunker/list/handler';

import type { RouteCommandContext } from '../../dispatch';

import {
  type InstalledPluginEntry,
  type PluginCatalogEntry,
  PLUGIN_QUERY_RELAYS,
  queryPluginCatalog,
  readInstalledPlugins,
  readLocalPluginPackageCapabilities,
  readLocalPluginPackageVersion,
  suggestedAlias,
} from '../install/handler';
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
};

export type PluginReleaseStatus =
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
  published: PluginCatalogEntry;
  authorSigner: AuthorSigner;
  git: PluginReleaseGitState;
  repositoryPath: string;
  status: PluginReleaseStatus;
};

export type PluginsReleasesRepresentation = {
  relays: string[];
  signerCount: number;
  installedCount: number;
  matchedCount: number;
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

  if (ctx.botPubkey) {
    signers.push({
      pubkey: ctx.botPubkey,
      label: `bot ${maskedNpub(ctx.botPubkey)}`,
      source: 'bot',
    });
  }

  const bunkerList = handleBunkerList({ db: ctx.seenDb });

  if (bunkerList.data.view === 'list') {
    for (const item of bunkerList.data.items) {
      signers.push({
        pubkey: item.userPubkey,
        label: `bunker ${item.name}`,
        source: 'bunker',
      });
    }
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
  capabilitiesMatch: boolean,
): PluginReleaseStatus {
  if (!localVersion) {
    return 'version-unknown';
  }

  const compared = compareVersions(localVersion, published.version);

  if (compared === null) {
    return 'version-unknown';
  }

  if (compared === 0 && capabilitiesMatch) {
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

  if (!git.remotes.every((remote) => remote.branchReady && remote.tagReady)) {
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
  const installedPlugins = readInstalledPlugins(ctx.dmBotRoot);
  const catalog = await queryPluginCatalog(ctx);
  const signers = authorSigners(ctx);

  const entries = installedPlugins.flatMap(
    (installed): PluginReleaseEntry[] => {
      const match = matchPublishedPlugin({ installed, catalog, signers });

      if (!match) {
        return [];
      }

      const localVersion = readLocalPluginPackageVersion({
        dmBotRoot: ctx.dmBotRoot,
        alias: installed.alias,
      });

      const versionTag = localVersion ? `v${localVersion}` : 'v0.0.0';

      const localCapabilities = readLocalPluginPackageCapabilities({
        dmBotRoot: ctx.dmBotRoot,
        alias: installed.alias,
      });

      const git = inspectPluginReleaseGit({
        dmBotRoot: ctx.dmBotRoot,
        alias: installed.alias,
        versionTag,
      });

      const pluginDir = join(ctx.dmBotRoot, 'plugins', installed.alias);

      return [
        {
          installed,
          localVersion,
          published: match.published,
          authorSigner: match.signer,
          git,
          repositoryPath: relative(ctx.cwd, pluginDir).replace(/\\/g, '/'),
          status: releaseStatus(
            localVersion,
            match.published,
            git,
            capabilityRelationsEqual(
              localCapabilities,
              match.published.capabilities,
            ),
          ),
        },
      ];
    },
  );

  const representation: PluginsReleasesRepresentation = {
    relays: PLUGIN_QUERY_RELAYS,
    signerCount: signers.length,
    installedCount: installedPlugins.length,
    matchedCount: entries.length,
    entries,
  };

  if (ctx.source === 'web') {
    return renderPluginsReleasesWeb(representation);
  }

  return renderPluginsReleasesText(representation, { prefix: ctx.prefix });
}
