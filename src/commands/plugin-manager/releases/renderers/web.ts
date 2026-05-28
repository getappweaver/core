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
    .web-row.plugins-release-action-row {
      align-items: center;
      gap: 0.45rem;
    }

    .web-stack.plugins-release-main {
      gap: 0.3rem;
    }
  `,
} as const;

function statusBadge(status: PluginReleaseStatus): WebNode {
  const propsByStatus = {
    'published-ok': { label: 'ok', tone: 'success' as const },
    'publish-needed': { label: 'publish needed', tone: 'warning' as const },
    'local-behind': { label: 'local behind', tone: 'muted' as const },
    'version-unknown': { label: 'version unknown', tone: 'warning' as const },
  }[status];

  return {
    type: 'element',
    tag: 'badge',
    props: { ...propsByStatus, size: 'sm' },
  };
}

function releaseCard(entry: PluginReleaseEntry): WebNode {
  const canPublish = entry.status === 'publish-needed';

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
          textBlock(
            `${entry.published.title || entry.published.name} · author via ${entry.authorSigner.label}`,
            'muted',
          ),
          ...(canPublish
            ? [
                {
                  type: 'element' as const,
                  tag: 'row' as const,
                  props: { className: 'plugins-release-action-row' },
                  children: [
                    {
                      type: 'element' as const,
                      tag: 'button' as const,
                      props: {
                        label: 'Publish',
                        className: 'web-button',
                        action: {
                          type: 'command' as const,
                          command: 'plugins',
                          subcommand: 'publish',
                          arguments: { alias: entry.installed.alias },
                          options: {},
                          recordInTimeline: false,
                          clientStatus: {
                            pending: `Publishing ${entry.installed.alias} plugin...`,
                            success: `Published ${entry.installed.alias} plugin.`,
                          },
                        },
                      },
                    },
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
