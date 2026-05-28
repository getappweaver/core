import type { WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { textBlock, textNode } from '@src/web/widgets';

import type { PluginsPublishRepresentation } from '../handler';

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
    .web-row.plugins-publish-relay-row {
      align-items: center;
      gap: 0.45rem;
    }
  `,
} as const;

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
