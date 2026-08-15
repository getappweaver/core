import type { WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { textBlock, textNode } from '@src/web/widgets';

import type {
  PluginReleaseEntry,
  PluginReleaseStatus,
  PluginsReleasesRepresentation,
} from '../handler';

const pluginsReleasesStylesheet = {
  id: 'plugins-releases-web',
  cssText: `
    .web-stack.plugins-releases-layout {
      gap: 0.65rem;
    }

    .web-box.plugins-release-card {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 94%, transparent);
    }

    .web-row.plugins-release-title-row,
    .web-row.plugins-release-meta-row,
    .web-row.plugins-release-git-row,
    .web-row.plugins-release-action-row {
      align-items: center;
      gap: 0.45rem;
    }

    .web-stack.plugins-release-main {
      gap: 0.3rem;
    }

    .web-row.plugins-release-git-row {
      flex-wrap: wrap;
    }
  `,
} as const;

function statusBadge(status: PluginReleaseStatus): WebNode {
  const propsByStatus = {
    'published-ok': { label: 'ok', tone: 'success' as const },
    'publish-needed': { label: 'publish needed', tone: 'warning' as const },
    'metadata-publish-needed': {
      label: 'metadata publish needed',
      tone: 'warning' as const,
    },
    'commit-needed': { label: 'commit needed', tone: 'danger' as const },
    'tag-needed': { label: 'tag needed', tone: 'danger' as const },
    'push-needed': { label: 'push needed', tone: 'warning' as const },
    'local-behind': { label: 'local behind', tone: 'muted' as const },
    'version-unknown': { label: 'version unknown', tone: 'warning' as const },
  }[status];

  return {
    type: 'element',
    tag: 'badge',
    props: { ...propsByStatus, size: 'sm' },
  };
}

function gitBadge(
  label: string,
  tone: 'success' | 'warning' | 'danger' | 'muted',
): WebNode {
  return {
    type: 'element',
    tag: 'badge',
    props: { label, tone, size: 'sm' },
  };
}

function gitStateRow(entry: PluginReleaseEntry): WebNode {
  return {
    type: 'element',
    tag: 'row',
    props: { className: 'plugins-release-git-row' },
    children: [
      gitBadge(
        entry.git.changedFileCount === 0
          ? 'clean'
          : `${entry.git.stagedFileCount} staged`,
        entry.git.changedFileCount === 0 ? 'success' : 'danger',
      ),
      ...(entry.git.changedFileCount > 0
        ? [gitBadge(`${entry.git.unstagedFileCount} unstaged`, 'danger')]
        : []),
      gitBadge(
        entry.git.branch ?? 'detached HEAD',
        entry.git.branch ? 'muted' : 'danger',
      ),
      gitBadge(
        entry.git.localTagAtHead
          ? `tag v${entry.localVersion}`
          : 'tag missing at HEAD',
        entry.git.localTagAtHead ? 'success' : 'danger',
      ),
      ...entry.git.remotes.map((remote) =>
        gitBadge(
          !remote.configured
            ? `${remote.name} missing`
            : remote.branchReady && remote.tagReady
              ? `${remote.name} ready`
              : `${remote.name} push needed`,
          !remote.configured
            ? 'danger'
            : remote.branchReady && remote.tagReady
              ? 'success'
              : 'warning',
        ),
      ),
    ],
  };
}

function releaseCard(entry: PluginReleaseEntry): WebNode {
  const canPublish =
    (entry.status === 'publish-needed' ||
      entry.status === 'metadata-publish-needed' ||
      entry.status === 'push-needed') &&
    entry.git.branch !== null &&
    entry.git.localTagAtHead &&
    entry.git.remotes.every((remote) => remote.configured);

  const reviewChanges = entry.git.changedFileCount > 0;

  const pushNeeded = entry.git.remotes.some(
    (remote) => !remote.branchReady || !remote.tagReady,
  );

  const metadataPublish = entry.status === 'metadata-publish-needed';

  return {
    type: 'element',
    tag: 'box',
    props: { padding: 'md', className: 'plugins-release-card' },
    children: [
      {
        type: 'element',
        tag: 'stack',
        props: { className: 'plugins-release-main' },
        children: [
          {
            type: 'element',
            tag: 'row',
            props: { className: 'plugins-release-title-row' },
            children: [
              {
                type: 'element',
                tag: 'text',
                props: { weight: 'bold' },
                children: [textNode(entry.installed.alias)],
              },
              statusBadge(entry.status),
            ],
          },
          {
            type: 'element',
            tag: 'row',
            props: { className: 'plugins-release-meta-row' },
            children: [
              {
                type: 'element',
                tag: 'badge',
                props: {
                  label: `local ${entry.localVersion ?? 'unknown'}`,
                  tone: 'info',
                  size: 'sm',
                },
              },
              {
                type: 'element',
                tag: 'badge',
                props: {
                  label: `published ${entry.published.version || 'unknown'}`,
                  tone: 'muted',
                  size: 'sm',
                },
              },
            ],
          },
          gitStateRow(entry),
          textBlock(
            `${entry.published.title || entry.published.name} · author via ${entry.authorSigner.label}`,
            'muted',
          ),
          ...(canPublish || reviewChanges
            ? [
                {
                  type: 'element' as const,
                  tag: 'row' as const,
                  props: { className: 'plugins-release-action-row' },
                  children: [
                    ...(reviewChanges
                      ? [
                          {
                            type: 'element' as const,
                            tag: 'button' as const,
                            props: {
                              label: 'Review changes',
                              className: 'web-button',
                              action: {
                                type: 'command' as const,
                                command: 'file',
                                subcommand: 'diff',
                                arguments: { path: '.' },
                                options: {
                                  timeline: true,
                                  repository: entry.repositoryPath,
                                },
                                recordInTimeline: true,
                                clientStatus: {
                                  pending: `Loading ${entry.installed.alias} changes...`,
                                  success: `Loaded ${entry.installed.alias} changes.`,
                                },
                              },
                            },
                          },
                        ]
                      : []),
                    ...(canPublish
                      ? [
                          {
                            type: 'element' as const,
                            tag: 'button' as const,
                            props: {
                              label: pushNeeded
                                ? 'Push & Publish'
                                : metadataPublish
                                  ? 'Republish metadata'
                                  : 'Publish',
                              className: 'web-button',
                              action: {
                                type: 'command' as const,
                                command: 'plugins',
                                subcommand: 'publish',
                                arguments: { alias: entry.installed.alias },
                                options: {},
                                recordInTimeline: false,
                                clientStatus: {
                                  pending: `${pushNeeded ? 'Pushing and publishing' : 'Publishing'} ${entry.installed.alias} plugin...`,
                                  success: `Published ${entry.installed.alias} plugin.`,
                                },
                              },
                            },
                          },
                        ]
                      : []),
                  ],
                },
              ]
            : []),
        ],
      },
    ],
  };
}

export function renderPluginsReleasesWeb(
  representation: PluginsReleasesRepresentation,
): WebNodeRoot {
  const hidden = representation.installedCount - representation.matchedCount;

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'releases' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'md', className: 'plugins-releases-layout' },
      children: [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold' },
          children: [textNode('Plugin Releases')],
        },
        textBlock(
          `Matched ${representation.matchedCount}/${representation.installedCount} installed plugin(s) using ${representation.signerCount} signer(s) across ${representation.relays.length} relays.`,
          'muted',
        ),
        ...(hidden > 0
          ? [
              textBlock(
                `Hidden non-authored/unknown plugin(s): ${hidden}`,
                'muted',
              ),
            ]
          : []),
        ...(representation.entries.length === 0
          ? [
              textBlock(
                'No installed plugins matched the available author signers.',
                'muted',
              ),
            ]
          : representation.entries.map(releaseCard)),
      ],
    },
    stylesheets: [pluginsReleasesStylesheet],
  };
}
