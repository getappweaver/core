import type { CoreUpdateSnapshot } from '@src/core/update-check';
import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

const botUpdateCheckStylesheet = {
  id: 'bot-update-check-web',
  cssText: `
    .web-box.bot-update-check-card {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 92%, transparent);
    }

    .web-row.bot-update-check-actions,
    .web-row.bot-update-check-kv {
      align-items: center;
    }

    .web-row.bot-update-check-kv > .web-text:first-child {
      min-width: 5rem;
    }

    .web-box.bot-update-check-changelog-panel {
      border-left: 2px solid var(--color-warning, currentColor);
      background: color-mix(in srgb, var(--color-warning, currentColor) 9%, transparent);
    }

    .web-stack.bot-update-check-changelog-list {
      gap: 0.25rem;
    }
  `,
} as const;

const CHANGELOG_REVEAL_ID = 'bot-update-check-changelog';

function checkedAtLabel(checkedAtMs: number | null): string {
  if (checkedAtMs === null) {
    return 'not checked yet';
  }

  return new Date(checkedAtMs).toLocaleString();
}

function stateLabel(state: CoreUpdateSnapshot['state']): string {
  if (state === 'available') {
    return 'update available';
  }

  if (state === 'up_to_date') {
    return 'up to date';
  }

  return state;
}

function stateTone(state: CoreUpdateSnapshot['state']): WebTone {
  if (state === 'available') {
    return 'warning';
  }

  if (state === 'up_to_date') {
    return 'success';
  }

  return 'muted';
}

function updateAction(): WebAction {
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

function kvRow(label: string, value: string): WebNode {
  return row(
    [
      {
        type: 'element',
        tag: 'text',
        props: { tone: 'muted', size: 'sm' },
        children: [textNode(label)],
      },
      {
        type: 'element',
        tag: 'text',
        props: { size: 'sm' },
        children: [textNode(value)],
      },
    ],
    'sm',
  );
}

function updateButton(update: CoreUpdateSnapshot): WebNode | null {
  if (update.state !== 'available') {
    return null;
  }

  return {
    type: 'element',
    tag: 'button',
    props: {
      label: 'Update',
      tone: 'warning',
      className: 'web-button',
      action: updateAction(),
    },
  };
}

function changelogButton(update: CoreUpdateSnapshot): WebNode | null {
  if (update.changelog.length === 0) {
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
        targetId: CHANGELOG_REVEAL_ID,
      },
    },
  };
}

function changelogPanel(update: CoreUpdateSnapshot): WebNode | null {
  if (update.changelog.length === 0) {
    return null;
  }

  return {
    type: 'element',
    tag: 'box',
    props: {
      padding: 'sm',
      className: 'bot-update-check-changelog-panel',
      revealId: CHANGELOG_REVEAL_ID,
      hiddenUntilRevealed: true,
    },
    children: [
      stack(
        [
          {
            type: 'element',
            tag: 'text',
            props: { weight: 'semibold', size: 'sm', tone: 'warning' },
            children: [textNode('Changelog')],
          },
          ...update.changelog.map((entry) =>
            textBlock(`${entry.ref} ${entry.subject}`, 'default'),
          ),
          ...(update.changelogTruncated
            ? [textBlock('Additional commits hidden.', 'muted')]
            : []),
        ],
        'xs',
      ),
    ],
  };
}

function versionLabel(update: CoreUpdateSnapshot): string {
  if (update.remoteVersion && update.remoteVersion !== update.localVersion) {
    return `${update.localVersion ?? 'unknown'} → ${update.remoteVersion}`;
  }

  return update.localVersion ?? update.remoteVersion ?? 'unknown';
}

function updateLevelLabel(update: CoreUpdateSnapshot): string {
  if (update.updateLevel === 'same') {
    return 'same version';
  }

  if (update.updateLevel === 'unknown') {
    return 'unknown update type';
  }

  return `${update.updateLevel} update`;
}

export function renderBotUpdateCheckWeb(
  update: CoreUpdateSnapshot,
): WebNodeRoot {
  const action = updateButton(update);
  const changelog = changelogButton(update);
  const changelogDetails = changelogPanel(update);

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'bot', subcommand: 'update-check' },
    tree: {
      type: 'element',
      tag: 'box',
      props: { padding: 'md', className: 'bot-update-check-card' },
      children: [
        stack(
          [
            row(
              [
                {
                  type: 'element',
                  tag: 'text',
                  props: { weight: 'bold' },
                  children: [textNode('Core update')],
                },
                {
                  type: 'element',
                  tag: 'text',
                  props: { tone: stateTone(update.state), size: 'sm' },
                  children: [textNode(stateLabel(update.state))],
                },
              ],
              'sm',
            ),
            ...(update.message ? [textBlock(update.message, 'muted')] : []),
            stack(
              [
                kvRow(
                  'Version',
                  `${versionLabel(update)} (${updateLevelLabel(update)})`,
                ),
                kvRow('Checked', checkedAtLabel(update.checkedAtMs)),
                ...(update.localRef ? [kvRow('Local', update.localRef)] : []),
                ...(update.remoteRef
                  ? [kvRow('Remote', update.remoteRef)]
                  : []),
                ...(update.upstream
                  ? [kvRow('Upstream', update.upstream)]
                  : []),
              ],
              'xs',
            ),
            ...(action || changelog
              ? [
                  {
                    type: 'element' as const,
                    tag: 'row' as const,
                    props: {
                      gap: 'sm' as const,
                      className: 'bot-update-check-actions',
                    },
                    children: [action, changelog].filter(
                      (node): node is WebNode => node !== null,
                    ),
                  },
                ]
              : []),
            ...(changelogDetails ? [changelogDetails] : []),
          ],
          'sm',
        ),
      ],
    },
    stylesheets: [botUpdateCheckStylesheet],
  };
}
