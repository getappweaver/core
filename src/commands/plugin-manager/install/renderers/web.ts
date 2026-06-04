import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { textBlock, textNode } from '@src/web/widgets';

import type {
  PluginCatalogEntry,
  PluginsInstallRepresentation,
} from '../handler';

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
  } else if (entry.compatibleRef) {
    label = `Compatible: ${entry.compatibleRef.tag}`;
    tone = 'success';
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

  const label = `Install ${entry.compatibleRef.tag}`;
  const pending = isUpdate ? 'Updating' : 'Installing';
  const success = isUpdate ? 'Successfully updated' : 'Successfully installed';

  return {
    type: 'element',
    tag: 'button',
    props: {
      label,
      className: 'web-button',
      action: {
        type: 'command',
        command: 'plugins',
        subcommand: 'install',
        arguments: { target: entry.id },
        options: {},
        recordInTimeline: false,
        clientStatus: {
          pending: `${pending} ${entry.title || entry.name} plugin...`,
          restarting: 'Restarting AppWeaver...',
          success: `${success} ${entry.title || entry.name} plugin.`,
        },
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

  const children = [action, coreAction, blockedNote].filter(
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
  if (entry.changelogRefs.length === 0) {
    return null;
  }

  if (entry.installedAlias && entry.updateAvailable) {
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

function changelogPanel(entry: PluginCatalogEntry): WebNode | null {
  if (entry.changelogRefs.length === 0) {
    return null;
  }

  const showInline = entry.installedAlias !== null && entry.updateAvailable;

  const label = entry.installedAlias
    ? `Changes from ${entry.installedVersion ?? 'current'} to ${entry.compatibleRef?.tag ?? 'latest'}`
    : `Release notes for ${entry.compatibleRef?.tag ?? 'latest'}`;

  return {
    type: 'element',
    tag: 'box',
    props: {
      padding: 'sm',
      className: 'plugins-install-changelog-panel',
      ...(showInline
        ? {}
        : {
            revealId: changelogRevealId(entry),
            hiddenUntilRevealed: true,
          }),
    },
    children: [
      {
        type: 'element',
        tag: 'stack',
        props: { gap: 'sm', className: 'plugins-install-changelog-list' },
        children: [
          {
            type: 'element',
            tag: 'text',
            props: { weight: 'semibold', size: 'sm', tone: 'warning' },
            children: [textNode(label)],
          },
          ...entry.changelogRefs.map((ref) =>
            textBlock(`${ref.tag}\n${ref.changelog}`, 'default'),
          ),
        ],
      },
    ],
  };
}

function pluginIcon(entry: PluginCatalogEntry): WebNode | null {
  if (
    !entry.icon.startsWith('data:image/svg+xml;base64,') &&
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

function pluginCard(entry: PluginCatalogEntry, coreVersion: string): WebNode {
  const actions = updateActions(entry);
  const changelog = changelogButton(entry);
  const changelogDetails = changelogPanel(entry);
  const icon = pluginIcon(entry);
  const source = sourceCodeLink(entry);

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
              pluginAuthor(entry),
            ],
          },
          ...(entry.description ? [textBlock(entry.description, 'muted')] : []),
          ...(source ? [source] : []),
          {
            type: 'element',
            tag: 'row',
            props: { gap: 'sm', className: 'plugins-install-card-actions' },
            children: [versionStatus(entry, coreVersion)],
          },
          ...(actions || changelog
            ? [
                {
                  type: 'element' as const,
                  tag: 'row' as const,
                  props: {
                    gap: 'sm' as const,
                    className: 'plugins-install-card-actions',
                  },
                  children: [actions, changelog].filter(
                    (node): node is WebNode => node !== null,
                  ),
                },
              ]
            : []),
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
          `Fetched ${representation.entries.length} plugin(s) from ${representation.relays.length} relays. Bot core: ${representation.coreVersion}.`,
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
