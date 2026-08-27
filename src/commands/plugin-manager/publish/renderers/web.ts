import type { WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { textBlock, textNode } from '@src/web/widgets';

import type {
  PluginsPublishPreviewRepresentation,
  PluginsPublishRepresentation,
} from '../handler';

const pluginsPublishStylesheet = {
  id: 'plugins-publish-web',
  cssText: `
    .web-stack.plugins-publish-layout {
      gap: 0.6rem;
    }

    .web-box.plugins-publish-card {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 94%, transparent);
    }

    .web-row.plugins-publish-title-row,
    .web-row.plugins-publish-relay-row,
    .web-row.plugins-publish-actions {
      align-items: center;
      gap: 0.45rem;
    }

    .web-row.plugins-publish-actions {
      flex-wrap: wrap;
    }

    .web-stack.plugins-publish-preview {
      gap: 0.35rem;
    }
  `,
} as const;

export function renderPluginsPublishPreviewWeb(
  representation: PluginsPublishPreviewRepresentation,
): WebNodeRoot {
  const confirmButtonId = `plugins-publish-confirm-${representation.alias}`;
  const publishStatusId = `plugins-publish-status-${representation.alias}`;
  const cardHighlightId = `plugins-release-card-${representation.alias}`;

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'publish' },
    tree: {
      type: 'element',
      tag: 'box',
      props: { padding: 'md', className: 'plugins-publish-card' },
      children: [
        {
          type: 'element',
          tag: 'stack',
          props: { className: 'plugins-publish-preview' },
          children: [
            {
              type: 'element',
              tag: 'row',
              props: { className: 'plugins-publish-title-row' },
              children: [
                {
                  type: 'element',
                  tag: 'text',
                  props: { weight: 'bold' },
                  children: [textNode(`Review ${representation.title}`)],
                },
                {
                  type: 'element',
                  tag: 'badge',
                  props: {
                    label: representation.firstPublish
                      ? 'first publication'
                      : representation.versionTag,
                    tone: 'warning',
                    size: 'sm',
                  },
                },
              ],
            },
            textBlock(`Package: ${representation.pluginName}`, 'muted'),
            textBlock(`Version: ${representation.versionTag}`, 'muted'),
            textBlock(
              `Signer: bunker ${representation.signerName} (${representation.signerPubkey.slice(0, 12)}...)`,
              'muted',
            ),
            textBlock(`Repository: ${representation.repo}`, 'muted'),
            textBlock(`Core API: ${representation.coreApiVersion}`, 'muted'),
            ...(representation.website
              ? [textBlock(`Website: ${representation.website}`, 'muted')]
              : []),
            textBlock(
              representation.iconPath
                ? `Icon: validate and upload ${representation.iconPath} to Blossom`
                : 'Icon: none configured',
              'muted',
            ),
            textBlock(`Description: ${representation.description}`, 'muted'),
            textBlock(
              `Capabilities: ${JSON.stringify(representation.capabilities)}`,
              'muted',
            ),
            ...representation.refs.map((ref) =>
              textBlock(
                `${ref.tag} · core ${ref.coreApiVersion} · ${ref.changelog}`,
                'muted',
              ),
            ),
            textBlock(`Relays: ${representation.relays.join(', ')}`, 'muted'),
            textBlock(
              representation.firstPublish
                ? 'Confirming will register the Nostr repository if needed, push the branch and tags, upload the icon, sign the catalog event, and publish it.'
                : 'Confirming will push and verify Git refs, upload the icon when configured, sign the updated catalog event, and publish it.',
              'warning',
            ),
            {
              type: 'element',
              tag: 'commandStatus',
              props: { id: publishStatusId },
            },
            {
              type: 'element',
              tag: 'row',
              props: { className: 'plugins-publish-actions' },
              children: [
                {
                  type: 'element',
                  tag: 'button',
                  props: {
                    id: confirmButtonId,
                    label: representation.firstPublish
                      ? 'Register & Publish'
                      : 'Confirm Publish',
                    className: 'web-button',
                    tone: 'warning',
                    action: {
                      type: 'command',
                      command: 'plugins',
                      subcommand: 'publish',
                      arguments: { alias: representation.alias },
                      options: {
                        signer: representation.signerName,
                        confirm: true,
                      },
                      recordInTimeline: false,
                      refresh: {
                        command: 'plugins',
                        subcommand: 'releases',
                        arguments: {},
                        options: {},
                        highlightTargetIds: [cardHighlightId],
                        recordInTimeline: false,
                      },
                      pendingUi: { presentation: 'none' },
                      clientStatus: {
                        background: true,
                        activeTargetId: confirmButtonId,
                        statusTargetId: publishStatusId,
                        pending: 'Publishing...',
                        success: 'Published.',
                      },
                    },
                  },
                },
                {
                  type: 'element',
                  tag: 'button',
                  props: {
                    label: 'Cancel',
                    className: 'web-button',
                    action: {
                      type: 'command',
                      command: 'plugins',
                      subcommand: 'releases',
                      arguments: {},
                      options: {},
                      recordInTimeline: false,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    stylesheets: [pluginsPublishStylesheet],
  };
}

function statusTone(
  status: PluginsPublishRepresentation['status'],
): 'success' | 'warning' | 'danger' {
  if (status === 'published') {
    return 'success';
  }

  return status === 'already-published' ? 'warning' : 'danger';
}

function relayRows(representation: PluginsPublishRepresentation): WebNode[] {
  if (representation.relays.length === 0) {
    return [];
  }

  return representation.relays.map((relay) => ({
    type: 'element' as const,
    tag: 'row' as const,
    props: { className: 'plugins-publish-relay-row' },
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
  }));
}

export function renderPluginsPublishWeb(
  representation: PluginsPublishRepresentation,
): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'publish' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { className: 'plugins-publish-layout' },
      children: [
        {
          type: 'element',
          tag: 'box',
          props: { padding: 'md', className: 'plugins-publish-card' },
          children: [
            {
              type: 'element',
              tag: 'stack',
              props: { gap: 'sm' },
              children: [
                {
                  type: 'element',
                  tag: 'row',
                  props: { className: 'plugins-publish-title-row' },
                  children: [
                    {
                      type: 'element',
                      tag: 'text',
                      props: { weight: 'bold' },
                      children: [textNode(`Publish ${representation.alias}`)],
                    },
                    {
                      type: 'element',
                      tag: 'badge',
                      props: {
                        label: representation.status.replace('-', ' '),
                        tone: statusTone(representation.status),
                        size: 'sm',
                      },
                    },
                  ],
                },
                textBlock(representation.message, 'muted'),
                ...(representation.eventId
                  ? [textBlock(`Event ID: ${representation.eventId}`, 'muted')]
                  : []),
                ...relayRows(representation),
              ],
            },
          ],
        },
      ],
    },
    stylesheets: [pluginsPublishStylesheet],
  };
}
