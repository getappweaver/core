import type { WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { textBlock, textNode } from '@src/web/widgets';

import type {
  PluginsPublishPreviewRepresentation,
  PluginsPublishRepresentation,
} from '../handler';
import type { PublishRepositoryChoice } from '../repository';

type RepositorySelectionViewProps = {
  alias: string;
  signerName: string;
  choices: PublishRepositoryChoice[];
  installedRepo: string;
  publishedRepo: string | null;
  fallbackRepo: string;
  preferredRepo: string;
};

export function renderPublishRepositorySelection({
  alias,
  signerName,
  choices,
  installedRepo,
  publishedRepo,
  fallbackRepo,
  preferredRepo,
}: RepositorySelectionViewProps): WebNodeRoot {
  const repos = [
    ...new Set([
      ...choices.map((choice) => choice.repo),
      installedRepo,
      publishedRepo,
      fallbackRepo,
    ]),
  ].filter(
    (repo): repo is string => Boolean(repo) && !repo?.startsWith('local://'),
  );

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'publish' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'sm' },
      children: [
        textBlock(`Choose publication repository for ${alias}`),
        textBlock(`Registered: ${installedRepo}`, 'muted'),
        textBlock(`Catalog: ${publishedRepo ?? '(not published)'}`, 'muted'),
        ...choices.map((choice) =>
          textBlock(`${choice.name}: ${choice.repo}`, 'muted'),
        ),
        textBlock(
          'Review the destination. Successful publication will register this repository in plugins.json.',
          'warning',
        ),
        {
          type: 'element',
          tag: 'form',
          props: {
            formOptionFieldNames: ['repo'],
            action: {
              type: 'command',
              command: 'plugins',
              subcommand: 'publish',
              arguments: { alias },
              options: { signer: signerName },
              recordInTimeline: false,
            },
          },
          children: [
            {
              type: 'element',
              tag: 'select',
              props: {
                formFieldName: 'repo',
                value: preferredRepo,
                choices: repos,
                choiceLabels: Object.fromEntries(
                  repos.map((repo) => [
                    repo,
                    `${
                      choices
                        .filter((choice) => choice.repo === repo)
                        .map((choice) => choice.name)
                        .join(', ') || 'registered / suggested'
                    } — ${repo}`,
                  ]),
                ),
              },
            },
            {
              type: 'element',
              tag: 'button',
              props: {
                label: 'Review selected repository',
                htmlType: 'submit',
                className: 'web-button',
              },
            },
          ],
        },
      ],
    },
  };
}

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
      justify-content: flex-end;
      position: sticky;
      bottom: 0;
      background: var(--color-panel);
      padding: .6rem 0;
      border-top: 1px solid var(--color-border);
    }

    .web-stack.plugins-publish-preview {
      gap: 0.35rem;
    }

    .web-stack.plugins-publish-catalog {
      gap: 0.45rem;
      padding-top: 0.35rem;
    }

    .web-text.plugins-publish-catalog-heading {
      font-size: 0.8rem;
      letter-spacing: 0.08em;
    }

    .web-details.plugins-publish-catalog-details {
      border-left: 2px solid var(--color-border, currentColor);
      padding-left: 0.55rem;
    }

    .web-stack.plugins-publish-catalog-body {
      gap: 0.35rem;
      padding-top: 0.35rem;
    }
  `,
} as const;

function renderCatalogEditor({
  alias,
  signerName,
  catalog,
}: {
  alias: string;
  signerName: string;
  catalog: NonNullable<PluginsPublishPreviewRepresentation['catalogEditor']>;
}): WebNode {
  return {
    type: 'element',
    tag: 'stack',
    props: { className: 'plugins-publish-catalog' },
    children: [
      {
        type: 'element',
        tag: 'text',
        props: {
          className: 'plugins-publish-catalog-heading',
          weight: 'bold',
        },
        children: [textNode('CATALOG')],
      },
      {
        type: 'element',
        tag: 'form',
        props: {
          className: 'web-form web-form--stacked',
          formOptionFieldNames: ['title', 'website', 'description', 'tags'],
          action: {
            type: 'command',
            command: 'plugins',
            subcommand: 'publish',
            arguments: { alias },
            options: {
              operation: 'catalog-update',
              signer: signerName,
            },
            recordInTimeline: false,
            pendingUi: {
              presentation: 'widget',
              label: 'Updating catalog…',
            },
          },
        },
        children: [
          {
            type: 'element',
            tag: 'details',
            props: { className: 'plugins-publish-catalog-details' },
            children: [
              {
                type: 'element',
                tag: 'summary',
                children: [textNode('Fields')],
              },
              {
                type: 'element',
                tag: 'stack',
                props: { className: 'plugins-publish-catalog-body' },
                children: [
                  textBlock('Title', 'muted'),
                  {
                    type: 'element',
                    tag: 'textField',
                    props: {
                      formFieldName: 'title',
                      value: catalog.title,
                      ariaLabel: 'Catalog title',
                    },
                  },
                  textBlock('Website', 'muted'),
                  {
                    type: 'element',
                    tag: 'textField',
                    props: {
                      formFieldName: 'website',
                      value: catalog.website,
                      inputPlaceholder: 'https://...',
                      ariaLabel: 'Catalog website',
                    },
                  },
                  textBlock('Description', 'muted'),
                  {
                    type: 'element',
                    tag: 'textArea',
                    props: {
                      formFieldName: 'description',
                      value: catalog.description,
                      ariaLabel: 'Catalog description',
                    },
                  },
                ],
              },
            ],
          },
          {
            type: 'element',
            tag: 'details',
            props: { className: 'plugins-publish-catalog-details' },
            children: [
              {
                type: 'element',
                tag: 'summary',
                children: [textNode('Tags')],
              },
              {
                type: 'element',
                tag: 'stack',
                props: { className: 'plugins-publish-catalog-body' },
                children: [
                  textBlock('Tags (comma-separated)', 'muted'),
                  {
                    type: 'element',
                    tag: 'textField',
                    props: {
                      formFieldName: 'tags',
                      value: catalog.tags.join(', '),
                      inputPlaceholder: 'productivity, tasks, nostr',
                      ariaLabel: 'Catalog tags',
                    },
                  },
                  ...(catalog.existingCatalogTags.length > 0
                    ? [
                        textBlock(
                          `Catalog tags: ${catalog.existingCatalogTags.join(', ')}`,
                          'muted',
                        ),
                      ]
                    : []),
                ],
              },
            ],
          },
          {
            type: 'element',
            tag: 'button',
            props: {
              label: 'Update catalog',
              htmlType: 'submit',
              className: 'web-button',
            },
          },
        ],
      },
    ],
  };
}

export function renderCatalogEditWeb({
  alias,
  signerName,
  catalog,
}: {
  alias: string;
  signerName: string;
  catalog: NonNullable<PluginsPublishPreviewRepresentation['catalogEditor']>;
}): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'publish' },
    tree: {
      type: 'element',
      tag: 'box',
      props: { padding: 'md', className: 'plugins-publish-card' },
      children: [renderCatalogEditor({ alias, signerName, catalog })],
    },
    stylesheets: [pluginsPublishStylesheet],
  };
}

export function renderPluginsPublishPreviewWeb(
  representation: PluginsPublishPreviewRepresentation,
): WebNodeRoot {
  const confirmButtonId = `plugins-publish-confirm-${representation.alias}`;
  const publishStatusId = `plugins-publish-status-${representation.alias}`;
  const cardHighlightId = `plugins-release-card-${representation.alias}`;

  const catalogEditor = representation.catalogEditor
    ? renderCatalogEditor({
        alias: representation.alias,
        signerName: representation.signerName,
        catalog: representation.catalogEditor,
      })
    : null;

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
                  children: [textNode(`Publish ${representation.title}`)],
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
            ...(representation.offerManagement
              ? [representation.offerManagement.tree]
              : [textBlock('Publication terms: Free · No offer', 'muted')]),
            ...(catalogEditor ? [catalogEditor] : []),
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
                    label: 'Publish release',
                    className: 'web-button',
                    tone: 'warning',
                    action: {
                      type: 'command',
                      command: 'plugins',
                      subcommand: 'publish',
                      arguments: { alias: representation.alias },
                      options: {
                        signer: representation.signerName,
                        repo: representation.repo,
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
    stylesheets: [
      pluginsPublishStylesheet,
      ...(representation.offerManagement?.stylesheets ?? []),
    ],
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
    meta: {
      command: 'plugins',
      subcommand: 'publish',
      outcome: {
        state:
          representation.status === 'failed'
            ? 'error'
            : representation.registrationError ||
                representation.discoveryError ||
                representation.relays.some((relay) => !relay.ok)
              ? 'warning'
              : 'success',
        message: representation.message,
      },
    },
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
                        label: representation.registrationError
                          ? 'published · registration pending'
                          : representation.discoveryError
                            ? 'published · discovery pending'
                            : representation.status.replace('-', ' '),
                        tone:
                          representation.registrationError ||
                          representation.discoveryError ||
                          (representation.status !== 'failed' &&
                            representation.relays.some((relay) => !relay.ok))
                            ? 'warning'
                            : statusTone(representation.status),
                        size: 'sm',
                      },
                    },
                  ],
                },
                textBlock(representation.message, 'muted'),
                ...(representation.diagnostics
                  ? [
                      {
                        type: 'element' as const,
                        tag: 'details' as const,
                        children: [
                          {
                            type: 'element' as const,
                            tag: 'summary' as const,
                            children: [textNode('Diagnostic history')],
                          },
                          textBlock(representation.diagnostics, 'muted'),
                        ],
                      },
                    ]
                  : []),
                ...(representation.registrationError &&
                representation.registrationRepo
                  ? [
                      {
                        type: 'element' as const,
                        tag: 'button' as const,
                        props: {
                          label: 'Retry local registration update',
                          className: 'web-button',
                          action: {
                            type: 'command' as const,
                            command: 'plugins',
                            subcommand: 'publish',
                            arguments: { alias: representation.alias },
                            options: { operation: 'registration-retry' },
                            recordInTimeline: false,
                          },
                        },
                      },
                    ]
                  : []),
                ...(representation.eventId
                  ? [textBlock(`Event ID: ${representation.eventId}`, 'muted')]
                  : []),
                ...relayRows(representation),
                {
                  type: 'element',
                  tag: 'button',
                  props: {
                    label: 'Manage catalog & offers',
                    className: 'web-button',
                    action: {
                      type: 'command',
                      command: 'plugins',
                      subcommand: 'publish',
                      arguments: { alias: representation.alias },
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
