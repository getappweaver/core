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
    .web-row.plugins-releases-toolbar,
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

    .web-form.plugins-release-publish-form {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .web-row.plugins-releases-toolbar {
      justify-content: space-between;
    }

    .web-stack.plugins-release-result {
      gap: 0.25rem;
      padding-top: 0.35rem;
      border-top: 1px solid var(--color-border, currentColor);
    }

    .web-row.plugins-release-result-row {
      align-items: center;
      gap: 0.45rem;
    }
  `,
} as const;

const RELEASES_RELOAD_BUTTON_ID = 'plugins-releases-reload';
const RELEASES_RELOAD_STATUS_ID = 'plugins-releases-reload-status';

function statusBadge(status: PluginReleaseStatus): WebNode {
  const propsByStatus = {
    'local-draft': { label: 'local draft', tone: 'info' as const },
    'not-published': { label: 'not published', tone: 'warning' as const },
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
  const firstPublish = entry.published === null;

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
            ? firstPublish && remote.name === 'origin'
              ? 'origin will register'
              : firstPublish && remote.name === 'github'
                ? 'github optional'
                : `${remote.name} missing`
            : remote.branchReady && remote.tagReady
              ? `${remote.name} ready`
              : `${remote.name} push needed`,
          !remote.configured
            ? firstPublish
              ? 'muted'
              : 'danger'
            : remote.branchReady && remote.tagReady
              ? 'success'
              : 'warning',
        ),
      ),
    ],
  };
}

function publishResult(entry: PluginReleaseEntry): WebNode[] {
  const result = entry.lastPublish;

  if (!result) {
    return [];
  }

  const tone =
    result.status === 'published'
      ? ('success' as const)
      : result.status === 'failed'
        ? ('danger' as const)
        : ('warning' as const);

  return [
    {
      type: 'element',
      tag: 'stack',
      props: { className: 'plugins-release-result' },
      children: [
        {
          type: 'element',
          tag: 'row',
          props: { className: 'plugins-release-result-row' },
          children: [
            {
              type: 'element',
              tag: 'badge',
              props: {
                label: result.status.replace('-', ' '),
                tone,
                size: 'sm',
              },
            },
            textBlock(result.message, 'muted'),
          ],
        },
        ...(result.eventId
          ? [textBlock(`Event ID: ${result.eventId}`, 'muted')]
          : []),
        ...result.relays.map((relay) => ({
          type: 'element' as const,
          tag: 'row' as const,
          props: { className: 'plugins-release-result-row' },
          children: [
            {
              type: 'element' as const,
              tag: 'badge' as const,
              props: {
                label: relay.ok ? 'ok' : 'failed',
                tone: relay.ok ? ('success' as const) : ('danger' as const),
                size: 'sm' as const,
              },
            },
            textBlock(
              relay.ok ? relay.relay : `${relay.relay}: ${relay.error}`,
              'muted',
            ),
          ],
        })),
      ],
    },
  ];
}

function releaseCard(entry: PluginReleaseEntry): WebNode {
  const firstPublish = entry.published === null;

  const sourceReadyForFirstPublish =
    firstPublish &&
    entry.localVersion !== null &&
    entry.git.changedFileCount === 0 &&
    entry.git.branch !== null &&
    entry.git.localTagAtHead;

  const canFirstPublish =
    sourceReadyForFirstPublish && entry.publishSigners.length > 0;

  const canPublish = firstPublish
    ? canFirstPublish
    : (entry.status === 'publish-needed' ||
        entry.status === 'metadata-publish-needed' ||
        entry.status === 'push-needed') &&
      entry.git.branch !== null &&
      entry.git.localTagAtHead &&
      entry.git.remotes.every((remote) => remote.configured);

  const prepareWithAi = firstPublish && !sourceReadyForFirstPublish;

  const reviewChanges = entry.git.changedFileCount > 0;

  const pushNeeded =
    !firstPublish &&
    entry.git.remotes.some((remote) => !remote.branchReady || !remote.tagReady);

  const metadataPublish = entry.status === 'metadata-publish-needed';
  const reviewButtonId = `plugins-release-review-${entry.installed.alias}`;
  const reviewStatusId = `plugins-release-review-status-${entry.installed.alias}`;
  const publishButtonId = `plugins-release-publish-${entry.installed.alias}`;
  const publishStatusId = `plugins-release-publish-status-${entry.installed.alias}`;

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
                  label: entry.published
                    ? `published ${entry.published.version || 'unknown'}`
                    : 'no catalog event',
                  tone: 'muted',
                  size: 'sm',
                },
              },
            ],
          },
          gitStateRow(entry),
          textBlock(
            entry.published && entry.authorSigner
              ? `${entry.published.title || entry.published.name} · author via ${entry.authorSigner.label}`
              : entry.publishSigners.length > 0
                ? 'Choose the author identity for the first publication.'
                : 'No saved bunker identity matches this repository owner.',
            'muted',
          ),
          ...(canPublish || reviewChanges || prepareWithAi
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
                              id: reviewButtonId,
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
                                pendingUi: { presentation: 'none' as const },
                                clientStatus: {
                                  background: true,
                                  activeTargetId: reviewButtonId,
                                  statusTargetId: reviewStatusId,
                                  pending: 'Loading...',
                                  success: 'Loaded.',
                                },
                              },
                            },
                          },
                        ]
                      : []),
                    ...(prepareWithAi
                      ? [
                          {
                            type: 'element' as const,
                            tag: 'button' as const,
                            props: {
                              label: 'Prepare release with AI',
                              className: 'web-button',
                              tone: 'warning' as const,
                              action: {
                                type: 'agentPrompt' as const,
                                prompt: [
                                  `Prepare the local AppWeaver plugin at ${entry.repositoryPath} for its first release.`,
                                  `Read ${entry.repositoryPath}/AGENTS.md and ${entry.repositoryPath}/__BOTTOMUP.md first.`,
                                  'Review the implementation, package metadata, capabilities, SVG icon, and documentation for consistency. Resolve readiness issues, run targeted lint, create the appropriate release commit, and ensure the package version tag points at HEAD. Do not publish or register remote repositories yet.',
                                ].join('\n\n'),
                                recordInTimeline: true,
                              },
                            },
                          },
                        ]
                      : []),
                    ...(canPublish && firstPublish
                      ? [
                          {
                            type: 'element' as const,
                            tag: 'form' as const,
                            props: {
                              className:
                                'web-form plugins-release-publish-form',
                              formOptionFieldNames: ['signer'],
                              action: {
                                type: 'command' as const,
                                command: 'plugins',
                                subcommand: 'publish',
                                arguments: {
                                  alias: entry.installed.alias,
                                },
                                options: {},
                                recordInTimeline: false,
                                pendingUi: { presentation: 'none' as const },
                                clientStatus: {
                                  background: true,
                                  activeTargetId: publishButtonId,
                                  statusTargetId: publishStatusId,
                                  pending: 'Preparing preview...',
                                  success: 'Preview ready.',
                                },
                              },
                            },
                            children: [
                              {
                                type: 'element' as const,
                                tag: 'select' as const,
                                props: {
                                  formFieldName: 'signer',
                                  choices: entry.publishSigners.flatMap(
                                    (signer) =>
                                      signer.connectionName
                                        ? [signer.connectionName]
                                        : [],
                                  ),
                                  choiceLabels: Object.fromEntries(
                                    entry.publishSigners.flatMap((signer) =>
                                      signer.connectionName
                                        ? [
                                            [
                                              signer.connectionName,
                                              signer.label,
                                            ],
                                          ]
                                        : [],
                                    ),
                                  ),
                                  value: entry.suggestedSignerName ?? '',
                                },
                              },
                              {
                                type: 'element' as const,
                                tag: 'button' as const,
                                props: {
                                  id: publishButtonId,
                                  label: 'Publish',
                                  className: 'web-button',
                                  htmlType: 'submit' as const,
                                },
                              },
                            ],
                          },
                        ]
                      : canPublish
                        ? [
                            {
                              type: 'element' as const,
                              tag: 'button' as const,
                              props: {
                                id: publishButtonId,
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
                                  pendingUi: { presentation: 'none' as const },
                                  clientStatus: {
                                    background: true,
                                    activeTargetId: publishButtonId,
                                    statusTargetId: publishStatusId,
                                    pending: 'Preparing preview...',
                                    success: 'Preview ready.',
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
          ...publishResult(entry),
        ],
      },
    ],
  };
}

export function renderPluginsReleasesWeb(
  representation: PluginsReleasesRepresentation,
): WebNodeRoot {
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
          tag: 'row',
          props: { className: 'plugins-releases-toolbar' },
          children: [
            {
              type: 'element',
              tag: 'text',
              props: { weight: 'bold' },
              children: [textNode('Plugin Releases')],
            },
            {
              type: 'element',
              tag: 'button',
              props: {
                id: RELEASES_RELOAD_BUTTON_ID,
                label: 'Reload',
                className: 'web-button',
                action: {
                  type: 'command',
                  command: 'plugins',
                  subcommand: 'releases',
                  arguments: {},
                  options: {},
                  recordInTimeline: false,
                  pendingUi: { presentation: 'none' as const },
                  clientStatus: {
                    background: true,
                    activeTargetId: RELEASES_RELOAD_BUTTON_ID,
                    statusTargetId: RELEASES_RELOAD_STATUS_ID,
                    pending: 'Reloading...',
                    success: 'Reloaded.',
                  },
                },
              },
            },
          ],
        },
        textBlock(
          `${representation.publishedCount}/${representation.installedCount} installed plugin(s) are published by ${representation.matchedSignerCount} matched author ${representation.matchedSignerCount === 1 ? 'identity' : 'identities'}. ${representation.unpublishedCount} not published.`,
          'muted',
        ),
        textBlock(
          `${representation.signerCount} available identities, including ${representation.bunkerSignerCount} bunker signer(s), across ${representation.relays.length} relays.`,
          'muted',
        ),
        ...(representation.hiddenCount > 0
          ? [
              textBlock(
                `Hidden plugin(s) published by unavailable authors: ${representation.hiddenCount}`,
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
