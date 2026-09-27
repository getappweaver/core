import type { WebRenderContext } from '@src/system/render-context';
import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { stack, textNode } from '@src/web/widgets';

import type { BotStatusData, BotStatusRepresentation } from '../representation';

const STATUS_REFRESH = {
  command: 'bot',
  subcommand: 'status',
  arguments: {},
  options: {},
} as const;

type StatusMenuItem = {
  label: string;
  action: WebAction;
};

function commandAction(params: {
  command: string;
  subcommand: string;
  arguments?: Record<string, unknown>;
  refreshStatus?: boolean;
  surface?: 'modal';
  modalTitle?: string;
}): WebAction {
  return {
    type: 'command',
    command: params.command,
    subcommand: params.subcommand,
    arguments: params.arguments ?? {},
    options: {},
    ...(params.refreshStatus ? { refresh: STATUS_REFRESH } : {}),
    ...(params.surface ? { surface: params.surface } : {}),
    ...(params.modalTitle ? { modalTitle: params.modalTitle } : {}),
  };
}

function versionStatus(data: BotStatusData): string {
  const update = data.coreUpdate;

  if (!update) {
    return data.version;
  }

  if (update.state === 'available') {
    const target = update.remoteVersion ?? update.remoteRef ?? 'remote';

    const level =
      update.updateLevel === 'same' || update.updateLevel === 'unknown'
        ? 'update'
        : `${update.updateLevel} update`;

    return `${update.localVersion ?? data.version} -> ${target} - ${level} available`;
  }

  if (update.state === 'checking') {
    return `${data.version} - checking`;
  }

  if (update.state === 'unavailable') {
    return `${data.version} - check unavailable`;
  }

  return `${update.localVersion ?? data.version} - up to date`;
}

function statusRow(
  label: string,
  value: string,
  tone?: WebTone,
  menuItems?: StatusMenuItem[],
): WebNode {
  const valueNode: WebNode = menuItems?.length
    ? {
        type: 'element',
        tag: 'overflowMenu',
        props: {
          label: value,
          className: 'web-button web-button--link bot-status-value-trigger',
          ...(tone ? { tone } : {}),
        },
        children: menuItems.map((item) => ({
          type: 'element',
          tag: 'menuItem',
          props: { label: item.label, action: item.action },
        })),
      }
    : {
        type: 'element',
        tag: 'text',
        props: { className: 'bot-status-value', ...(tone ? { tone } : {}) },
        children: [textNode(value)],
      };

  return {
    type: 'element',
    tag: 'row',
    props: { className: 'bot-status-row', gap: 'md' },
    children: [
      {
        type: 'element',
        tag: 'text',
        props: { className: 'bot-status-label', tone: 'muted' },
        children: [textNode(label)],
      },
      valueNode,
    ],
  };
}

export function renderBotStatusWeb(
  representation: BotStatusRepresentation,
  _context: WebRenderContext,
): WebNodeRoot {
  const data = representation.data;

  const workspaceItems: StatusMenuItem[] = ['parent', 'appweaver'].map(
    (target) => ({
      label: target,
      action: commandAction({
        command: 'bot',
        subcommand: 'workspace',
        arguments: { target },
        refreshStatus: true,
      }),
    }),
  );

  const sessionItems: StatusMenuItem[] = [
    {
      label: 'New session',
      action: commandAction({
        command: 'session',
        subcommand: 'new',
        refreshStatus: true,
      }),
    },
    {
      label: 'Resume latest',
      action: commandAction({
        command: 'session',
        subcommand: 'resume-last',
        refreshStatus: true,
      }),
    },
    {
      label: 'List sessions',
      action: commandAction({
        command: 'session',
        subcommand: 'list',
        surface: 'modal',
        modalTitle: 'Sessions',
      }),
    },
    ...(data.sessionId
      ? [
          {
            label: 'Show recent messages',
            action: commandAction({
              command: 'session',
              subcommand: 'messages',
              arguments: { session_id: data.sessionId, n: 5 },
              surface: 'modal',
              modalTitle: 'Session Messages',
            }),
          },
        ]
      : []),
  ];

  const rows = [
    statusRow('Workspace', data.workspace, 'info', workspaceItems),
    statusRow(
      'Session',
      data.sessionId ?? '(none)',
      data.sessionId ? 'info' : 'muted',
      sessionItems,
    ),
    statusRow(
      'Linting',
      data.linting,
      data.linting === 'on' ? 'success' : 'muted',
    ),
    statusRow('Version', versionStatus(data)),
    statusRow(
      'Relays',
      data.botRelayUrls.length > 0 ? data.botRelayUrls.join(', ') : '(none)',
      data.botRelayUrls.length > 0 ? undefined : 'muted',
    ),
  ];

  if (data.opencodeServeUrl) {
    rows.push(
      statusRow('Serve', `${data.opencodeServeUrl} (attached)`, 'info'),
    );
  }

  if (data.coreUpdate?.message) {
    rows.push(statusRow('Update', data.coreUpdate.message, 'muted'));
  }

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'bot', subcommand: 'status' },
    stylesheets: [
      {
        id: 'bot-status-rows',
        cssText: `
          .bot-status-row {
            flex-wrap: nowrap;
            padding: 0.3rem 0.45rem;
          }

          .bot-status-row:nth-child(even) {
            background: rgba(255, 255, 255, 0.05);
          }

          .bot-status-label {
            flex: 0 0 5.5rem;
            white-space: nowrap;
          }

          .bot-status-value {
            min-width: 0;
            margin-left: auto;
            text-align: right;
            overflow-wrap: anywhere;
          }

          .bot-status-value-trigger {
            color: var(--color-accent);
            opacity: 1;
            margin-right: 0;
            white-space: nowrap;
            text-underline-offset: 2px;
          }

          .bot-status-row > .web-overflow-menu {
            min-width: 0;
            margin-left: auto;
          }
        `.trim(),
      },
    ],
    tree: stack(rows, 'xs'),
  };
}
