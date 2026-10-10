import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { textBlock, textNode } from '@src/web/widgets';

import type {
  PluginCatalogEntry,
  PluginsInstallRepresentation,
} from '../handler';

import { paymentLabel } from './payments';

const pluginsInstallStylesheet = {
  id: 'plugins-install-web',
  cssText: `
    .web-stack.plugins-install-layout {
      gap: 0.75rem;
    }

    .web-box.plugins-install-card {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 92%, transparent);
    }

    .web-row.plugins-install-card-head {
      align-items: center;
      gap: 0.75rem;
    }

    .web-row.plugins-install-card-actions {
      align-items: center;
      gap: 0.5rem;
    }

    .web-stack.plugins-install-update-actions {
      gap: 0.35rem;
    }

    .web-row.plugins-install-update-action {
      align-items: center;
      gap: 0.5rem;
    }

    .web-box.plugins-install-changelog-panel {
      border-left: 2px solid var(--color-warning, currentColor);
      background: color-mix(in srgb, var(--color-warning, currentColor) 9%, transparent);
    }

    .web-stack.plugins-install-changelog-list {
      gap: 0.35rem;
      max-height: min(24rem, 55vh);
      overflow-y: auto;
      overflow-wrap: anywhere;
      min-height: 0;
    }

    .web-row.plugins-install-changelog-head {
      align-items: center;
      gap: 0.4rem;
    }

    .web-stack.plugins-install-card-main {
      min-width: 0;
      flex: 1 1 auto;
    }

    .web-image.plugins-install-icon {
      width: 2rem;
      height: 2rem;
      flex: 0 0 auto;
      background-color: var(--color-accent);
      image-rendering: pixelated;
    }

    .web-row.plugins-install-title-row {
      align-items: center;
      gap: 0.5rem;
    }

    .web-link.plugins-install-author {
      margin-left: auto;
      font-size: 0.82rem;
      white-space: nowrap;
    }

    .web-link.plugins-install-source-link {
      width: fit-content;
    }
  `,
} as const;

function testedCoreMajor(entry: PluginCatalogEntry): string {
  return entry.compatibleRef?.coreApiVersion.match(/\d+/)?.[0] ?? 'unknown';
}

function versionStatus(
  entry: PluginCatalogEntry,
  coreVersion: string,
): WebNode {
  let label: string;
  let tone: 'muted' | 'success' | 'warning';

  if (entry.installedAlias) {
    const installedVersion = entry.installedVersion ?? 'unknown';

    if (entry.updateAvailable || entry.blockedUpdateRef) {
      label = `Installed: ${entry.installedAlias} @ ${installedVersion} · update(s) available:`;
      tone = 'warning';
    } else {
      label = `Installed: ${entry.installedAlias} @ ${installedVersion} · up to date`;
      tone = 'success';
    }

    if (!entry.coreCompatibilityVerified) {
      label += ` · latest tested on core ${testedCoreMajor(entry)}`;
      tone = 'warning';
    }
  } else if (entry.compatibleRef) {
    if (entry.coreCompatibilityVerified) {
      label = `Compatible: ${entry.compatibleRef.tag}`;
      tone = 'success';
    } else {
      label = `Latest tested on core ${testedCoreMajor(entry)}`;
      tone = 'warning';
    }
  } else {
    const latest = entry.latestRef
      ? `${entry.latestRef.tag} / core ${entry.latestRef.coreApiVersion}`
      : 'no refs';

    label = `Needs different core: ${latest} (current ${coreVersion})`;
    tone = 'warning';
  }

  return {
    type: 'element',
    tag: 'text',
    props: { tone, size: 'sm' },
    children: [textNode(label)],
  };
}

function installButton(entry: PluginCatalogEntry): WebNode | null {
  if (!entry.compatibleRef) {
    return null;
  }

  const isUpdate = entry.installedAlias !== null;

  if (isUpdate && !entry.updateAvailable) {
    return null;
  }

  const label = entry.coreCompatibilityVerified
    ? `${isUpdate ? 'Update' : 'Install'} ${entry.compatibleRef.tag}`
    : isUpdate
      ? 'Update anyway'
      : 'Install anyway';

  const pending = isUpdate ? 'Updating' : 'Installing';
  const success = isUpdate ? 'Successfully updated' : 'Successfully installed';

  const paid =
    entry.payment &&
    !entry.payment.purchased &&
    ['active', 'unavailable'].includes(entry.payment.status);

  const freeNotice = entry.payment && !entry.payment.purchased && !paid;

  const restore =
    entry.payment?.purchased &&
    ['active', 'unavailable'].includes(entry.payment.status);

  return {
    type: 'element',
    tag: 'button',
    props: {
      label: paid
        ? entry.payment?.status === 'unavailable'
          ? 'Check purchase'
          : `Buy & ${isUpdate ? 'update' : 'install'}`
        : label,
      className: 'web-button',
      action: {
        type: 'command',
        command: 'plugins',
        subcommand: 'install',
        arguments: { target: entry.id },
        options: {},
        ...(paid || freeNotice || restore
          ? {
              surface: 'modal' as const,
              modalTitle:
                paid || restore ? 'App purchase' : 'Free version notice',
            }
          : {}),
        recordInTimeline: false,
        ...(!paid && !freeNotice && !restore
          ? {
              clientStatus: {
                pending: `${pending} ${entry.title || entry.name} plugin...`,
                restarting: 'Restarting AppWeaver...',
                success: `${success} ${entry.title || entry.name} plugin.`,
              },
            }
          : {}),
      },
    },
  };
}

function purchaseInfoButton(entry: PluginCatalogEntry): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: {
      label: '[i]',
      ariaLabel: 'Purchase terms and update consequences',
      className: 'web-button',
      action: {
        type: 'command',
        command: 'plugins',
        subcommand: 'install',
        arguments: { target: entry.id },
        options: { operation: 'info' },
        surface: 'modal',
        modalTitle: 'App purchase terms',
        recordInTimeline: false,
      },
    },
  };
}

function coreUpdateAction(): WebAction {
  return {
    type: 'command',
    command: 'bot',
    subcommand: 'update',
    arguments: {},
    options: {},
    clientStatus: {
      pending: 'Updating AppWeaver...',
      restarting: 'Restarting AppWeaver...',
      success: 'Updated AppWeaver.',
    },
  };
}

function coreUpdateButton(entry: PluginCatalogEntry): WebNode | null {
  if (!entry.blockedUpdateRef || !entry.coreUpdateCanUnlockBlockedRef) {
    return null;
  }

  return {
    type: 'element',
    tag: 'button',
    props: {
      label: `Update core · unlock ${entry.blockedUpdateRef.tag}`,
      tone: 'warning',
      className: 'web-button',
      action: coreUpdateAction(),
    },
  };
}

function blockedUpdateNote(entry: PluginCatalogEntry): WebNode | null {
  if (!entry.blockedUpdateRef || entry.coreUpdateCanUnlockBlockedRef) {
    return null;
  }

  return {
    type: 'element',
    tag: 'text',
    props: { tone: 'muted', size: 'sm' },
    children: [
      textNode(
        `${entry.blockedUpdateRef.tag} requires core ${entry.blockedUpdateRef.coreApiVersion}`,
      ),
    ],
  };
}

function updateActions(entry: PluginCatalogEntry): WebNode | null {
  const action = installButton(entry);
  const coreAction = coreUpdateButton(entry);
  const blockedNote = blockedUpdateNote(entry);
  const changelog = changelogButton(entry);

  const paid =
    entry.payment &&
    !entry.payment.purchased &&
    ['active', 'unavailable'].includes(entry.payment.status);

  const primaryButtons = [
    action && paid ? purchaseInfoButton(entry) : null,
    action,
    changelog,
  ].filter((node): node is WebNode => node !== null);

  const installAction: WebNode | null =
    primaryButtons.length > 0
      ? {
          type: 'element',
          tag: 'stack',
          props: { gap: 'xs' },
          children: [
            ...(action && paid
              ? [textBlock(paymentLabel(entry), 'warning')]
              : []),
            {
              type: 'element',
              tag: 'row',
              props: { gap: 'sm', className: 'plugins-install-card-actions' },
              children: primaryButtons,
            },
          ],
        }
      : null;

  const children = [installAction, coreAction, blockedNote].filter(
    (node): node is WebNode => node !== null,
  );

  if (children.length === 0) {
    return null;
  }

  return {
    type: 'element',
    tag: 'stack',
    props: { gap: 'xs', className: 'plugins-install-update-actions' },
    children: children.map((node) => ({
      type: 'element' as const,
      tag: 'row' as const,
      props: { gap: 'sm' as const, className: 'plugins-install-update-action' },
      children: [node],
    })),
  };
}

function changelogRevealId(entry: PluginCatalogEntry): string {
  return `plugin-changelog-${entry.id}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function changelogButton(entry: PluginCatalogEntry): WebNode | null {
  if (entry.refs.length === 0) {
    return null;
  }

  return {
    type: 'element',
    tag: 'button',
    props: {
      label: 'Changelog',
      className: 'web-button',
      action: {
        type: 'toggleReveal',
        targetId: changelogRevealId(entry),
      },
    },
  };
}

type ChangelogPanelProps = {
  entry: PluginCatalogEntry;
  focusedUpdate: boolean;
};

function changelogPanel({
  entry,
  focusedUpdate,
}: ChangelogPanelProps): WebNode | null {
  const refs = focusedUpdate ? entry.changelogRefs : entry.refs;

  if (
    refs.length === 0 ||
    (focusedUpdate && (!entry.installedAlias || !entry.updateAvailable))
  ) {
    return null;
  }

  const label = focusedUpdate
    ? `Changes from ${entry.installedVersion ?? 'current'} to ${entry.compatibleRef?.tag ?? 'latest'}`
    : 'Published release history · newest first';

  const revealId = focusedUpdate
    ? `${changelogRevealId(entry)}-updates`
    : changelogRevealId(entry);

  return {
    type: 'element',
    tag: 'box',
    props: {
      padding: 'sm',
      className: 'plugins-install-changelog-panel',
      revealId,
      ...(focusedUpdate
        ? {}
        : {
            hiddenUntilRevealed: true,
          }),
    },
    children: [
      {
        type: 'element',
        tag: 'row',
        props: { className: 'plugins-install-changelog-head' },
        children: [
          {
            type: 'element',
            tag: 'text',
            props: { weight: 'semibold', size: 'sm', tone: 'warning' },
            children: [textNode(label)],
          },
        ],
      },
      {
        type: 'element',
        tag: 'stack',
        props: { gap: 'sm', className: 'plugins-install-changelog-list' },
        children: [
          ...[...refs].reverse().map((ref) => {
            return {
              type: 'element' as const,
              tag: 'stack' as const,
              props: { gap: 'xs' as const },
              children: [
                {
                  type: 'element' as const,
                  tag: 'text' as const,
                  props: { weight: 'semibold' as const },
                  children: [
                    textNode(`${ref.tag} · core ${ref.coreApiVersion}`),
                  ],
                },
                textBlock(ref.changelog, 'default'),
              ],
            };
          }),
        ],
      },
    ],
  };
}

function pluginIcon(entry: PluginCatalogEntry): WebNode | null {
  if (
    !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(entry.icon) &&
    !entry.icon.startsWith('https://') &&
    !entry.icon.startsWith('http://')
  ) {
    return null;
  }

  return {
    type: 'element',
    tag: 'image',
    props: {
      src: entry.icon,
      alt: '',
      className: 'plugins-install-icon',
    },
  };
}

function pluginTitle(entry: PluginCatalogEntry): WebNode {
  const label = entry.title || entry.name;

  if (
    entry.website.startsWith('https://') ||
    entry.website.startsWith('http://')
  ) {
    return {
      type: 'element',
      tag: 'link',
      props: {
        href: entry.website,
        external: true,
        weight: 'bold',
      },
      children: [textNode(label)],
    };
  }

  return {
    type: 'element',
    tag: 'text',
    props: { weight: 'bold' },
    children: [textNode(label)],
  };
}

function pluginAuthor(entry: PluginCatalogEntry): WebNode {
  return {
    type: 'element',
    tag: 'link',
    props: {
      href: entry.author.href,
      external: true,
      tone: entry.author.verified ? 'success' : 'muted',
      className: 'plugins-install-author',
    },
    children: [textNode(entry.author.label)],
  };
}

function sourceCodeHref(repo: string): string | null {
  if (repo.startsWith('nostr://')) {
    return `https://gitworkshop.dev/${repo.slice('nostr://'.length)}`;
  }

  if (repo.startsWith('https://') || repo.startsWith('http://')) {
    return repo;
  }

  return null;
}

function sourceCodeLink(entry: PluginCatalogEntry): WebNode | null {
  const href = sourceCodeHref(entry.repo);

  if (!href) {
    return null;
  }

  return {
    type: 'element',
    tag: 'link',
    props: {
      href,
      external: true,
      className: 'plugins-install-source-link',
    },
    children: [textNode('Source code')],
  };
}

function capabilityLabels(entry: PluginCatalogEntry): WebNode[] {
  return (
    [
      ['provides', entry.capabilities.provides],
      ['uses', entry.capabilities.uses],
      ['requires', entry.capabilities.requires],
    ] as const
  ).flatMap(([relation, capabilities]) =>
    capabilities.map((capability) => ({
      type: 'element' as const,
      tag: 'badge' as const,
      props: {
        label: `${relation}: ${capability.name}:v${capability.version}`,
        size: 'sm' as const,
        tone:
          relation === 'provides' ? ('success' as const) : ('muted' as const),
      },
    })),
  );
}

function pluginCard(entry: PluginCatalogEntry, coreVersion: string): WebNode {
  const actions = updateActions(entry);
  const changelogDetails = changelogPanel({ entry, focusedUpdate: false });
  const updateDetails = changelogPanel({ entry, focusedUpdate: true });
  const icon = pluginIcon(entry);
  const source = sourceCodeLink(entry);
  const capabilities = capabilityLabels(entry);

  return {
    type: 'element',
    tag: 'box',
    props: {
      id: `plugin-${entry.id}`,
      padding: 'md',
      className: 'plugins-install-card',
    },
    children: [
      {
        type: 'element',
        tag: 'stack',
        props: { gap: 'sm', className: 'plugins-install-card-main' },
        children: [
          {
            type: 'element',
            tag: 'row',
            props: { className: 'plugins-install-title-row' },
            children: [
              ...(icon ? [icon] : []),
              pluginTitle(entry),
              ...(entry.payment &&
              (entry.payment.purchased ||
                !['active', 'unavailable'].includes(entry.payment.status))
                ? [
                    {
                      type: 'element' as const,
                      tag: 'badge' as const,
                      props: {
                        label: paymentLabel(entry),
                        size: 'sm' as const,
                        tone: entry.payment.purchased
                          ? ('success' as const)
                          : entry.payment.status === 'active'
                            ? ('warning' as const)
                            : ('muted' as const),
                      },
                    },
                  ]
                : []),
              pluginAuthor(entry),
            ],
          },
          ...(entry.description ? [textBlock(entry.description, 'muted')] : []),
          ...(source ? [source] : []),
          ...(capabilities.length > 0
            ? [
                {
                  type: 'element' as const,
                  tag: 'row' as const,
                  props: { gap: 'xs' as const },
                  children: capabilities,
                },
              ]
            : []),
          {
            type: 'element',
            tag: 'row',
            props: { gap: 'sm', className: 'plugins-install-card-actions' },
            children: [
              versionStatus(entry, coreVersion),
              ...(!installButton(entry) &&
              entry.payment &&
              !entry.payment.purchased &&
              ['active', 'unavailable'].includes(entry.payment.status)
                ? [textBlock(paymentLabel(entry), 'muted')]
                : []),
            ],
          },
          ...(actions ? [actions] : []),
          ...(updateDetails ? [updateDetails] : []),
          ...(changelogDetails ? [changelogDetails] : []),
        ],
      },
    ],
  };
}

export function renderPluginsInstallWeb(
  representation: PluginsInstallRepresentation,
): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'install' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'md', className: 'plugins-install-layout' },
      children: [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold' },
          children: [textNode('Plugin Catalog')],
        },
        textBlock(
          `Fetched ${representation.entries.length} plugin(s) from ${representation.relays.length} relays. Bot core: ${representation.coreVersion}.${representation.filter ? ` Filter: ${representation.filter}.` : ''}`,
          'muted',
        ),
        ...(representation.entries.length === 0
          ? [textBlock('No plugins found on the queried relays.', 'muted')]
          : representation.entries.map((entry) =>
              pluginCard(entry, representation.coreVersion),
            )),
      ],
    },
    stylesheets: [pluginsInstallStylesheet],
  };
}
