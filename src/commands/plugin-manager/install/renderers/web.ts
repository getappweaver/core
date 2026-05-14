import type { WebNode, WebNodeRoot } from '@src/web/ui-schema';
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
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .web-stack.plugins-install-card-main {
      min-width: 0;
      flex: 1 1 auto;
    }

    .web-row.plugins-install-card-head > .web-badge {
      flex: 0 1 auto;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .web-text.plugins-install-repo {
      overflow-wrap: anywhere;
    }
  `,
} as const;

function badge(label: string, tone: 'muted' | 'success' | 'warning'): WebNode {
  return {
    type: 'element',
    tag: 'badge',
    props: { label, tone, size: 'sm' },
  };
}

function versionBadge(entry: PluginCatalogEntry, coreMajor: string): WebNode {
  if (entry.installedAlias) {
    return badge(
      `Installed: ${entry.installedAlias} @ ${entry.installedVersion}`,
      'success',
    );
  }

  if (entry.compatibleRef) {
    return badge(`Compatible: ${entry.compatibleRef.tag}`, 'success');
  }

  const latest = entry.latestRef
    ? `${entry.latestRef.tag} / core ${entry.latestRef.coreMajor}`
    : 'no refs';

  return badge(
    `Needs different core: ${latest} (current ${coreMajor})`,
    'warning',
  );
}

function pluginCard(entry: PluginCatalogEntry, coreMajor: string): WebNode {
  return {
    type: 'element',
    tag: 'box',
    props: { padding: 'md', className: 'plugins-install-card' },
    children: [
      {
        type: 'element',
        tag: 'row',
        props: { gap: 'md', className: 'plugins-install-card-head' },
        children: [
          {
            type: 'element',
            tag: 'stack',
            props: { gap: 'xs', className: 'plugins-install-card-main' },
            children: [
              {
                type: 'element',
                tag: 'text',
                props: { weight: 'bold' },
                children: [textNode(entry.name)],
              },
              ...(entry.description
                ? [textBlock(entry.description, 'muted')]
                : []),
              {
                type: 'element',
                tag: 'text',
                props: {
                  tone: 'muted',
                  whiteSpace: 'pre-wrap',
                  className: 'plugins-install-repo',
                },
                children: [textNode(entry.repo)],
              },
            ],
          },
          versionBadge(entry, coreMajor),
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
          `Fetched ${representation.entries.length} plugin(s) from ${representation.relays.length} relays. Bot core: ${representation.coreMajor}.`,
          'muted',
        ),
        ...(representation.entries.length === 0
          ? [textBlock('No plugins found on the queried relays.', 'muted')]
          : representation.entries.map((entry) =>
              pluginCard(entry, representation.coreMajor),
            )),
      ],
    },
    stylesheets: [pluginsInstallStylesheet],
  };
}
