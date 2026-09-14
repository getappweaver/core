import type { NwcConnectionSummary } from '@src/nwc/state';
import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

function commandAction(
  subcommand: string,
  connectionId?: string,
): Extract<WebAction, { type: 'command' }> {
  return {
    type: 'command',
    command: 'nwc',
    subcommand,
    arguments: connectionId ? { connection: connectionId } : {},
    options: {},
    recordInTimeline: false,
    surface: 'modal',
    modalTitle: 'NWC Wallets',
  };
}

function button(params: {
  label: string;
  action?: WebAction;
  tone?: 'default' | 'muted' | 'info' | 'success' | 'warning' | 'danger';
  htmlType?: 'button' | 'submit';
}): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: {
      label: params.label,
      ...(params.action ? { action: params.action } : {}),
      ...(params.tone ? { tone: params.tone } : {}),
      ...(params.htmlType ? { htmlType: params.htmlType } : {}),
    },
  };
}

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 12)}...${pubkey.slice(-8)}`;
}

function connectionCard(connection: NwcConnectionSummary): WebNode {
  const status = connection.verifiedAt
    ? `Verified ${new Date(connection.verifiedAt).toLocaleString()}`
    : 'Unverified';

  const identity = connection.walletAlias
    ? `${connection.walletAlias} (${shortPubkey(connection.walletPubkey)})`
    : shortPubkey(connection.walletPubkey);

  return {
    type: 'element',
    tag: 'box',
    props: { padding: 'md', className: 'nwc-connection-card' },
    children: [
      stack(
        [
          {
            type: 'element',
            tag: 'text',
            props: { weight: 'bold' },
            children: [textNode(connection.label)],
          },
          textBlock(identity, 'muted'),
          textBlock(status, connection.verifiedAt ? 'success' : 'warning'),
          textBlock(`Relays: ${connection.relayUrls.join(', ')}`, 'muted'),
          ...(connection.methods.length > 0
            ? [textBlock(`Methods: ${connection.methods.join(', ')}`, 'muted')]
            : []),
          row(
            [
              button({
                label: 'Info',
                action: commandAction('info', connection.id),
              }),
              button({
                label: 'Balance',
                action: commandAction('balance', connection.id),
              }),
              button({
                label: 'Remove',
                tone: 'danger',
                action: commandAction('remove', connection.id),
              }),
            ],
            'xs',
          ),
        ],
        'xs',
      ),
    ],
  };
}

function addConnectionForm(): WebNode {
  return {
    type: 'element',
    tag: 'form',
    props: {
      action: {
        ...commandAction('save'),
        arguments: {},
      },
    },
    children: [
      stack(
        [
          {
            type: 'element',
            tag: 'text',
            props: { weight: 'bold' },
            children: [textNode('Add NWC connection')],
          },
          {
            type: 'element',
            tag: 'textField',
            props: {
              formFieldName: 'label',
              inputPlaceholder: 'Wallet label',
            },
          },
          {
            type: 'element',
            tag: 'textArea',
            props: {
              formFieldName: 'connectionUri',
              inputPlaceholder: 'nostr+walletconnect://...',
              maxRows: 5,
            },
          },
          textBlock(
            'The connection secret is stored in the local core database and is not shown again.',
            'warning',
          ),
          row(
            [
              button({
                label: 'Add wallet',
                tone: 'success',
                htmlType: 'submit',
              }),
            ],
            'xs',
          ),
        ],
        'sm',
      ),
    ],
  };
}

export function renderNwcListText(
  connections: NwcConnectionSummary[],
  notice: string | null = null,
): string {
  const lines = connections.map((connection) => {
    const alias = connection.walletAlias
      ? `, wallet=${connection.walletAlias}`
      : '';

    const status = connection.verifiedAt ? 'verified' : 'unverified';

    return `${connection.label} [${connection.id}] (${status}${alias})\n  pubkey: ${connection.walletPubkey}\n  relays: ${connection.relayUrls.join(', ')}`;
  });

  return [
    ...(notice ? [notice, ''] : []),
    lines.length > 0 ? lines.join('\n\n') : 'No NWC connections configured.',
    '',
    'Open /nwc list in the web UI to add a connection.',
  ].join('\n');
}

export function renderNwcListWeb(params: {
  connections: NwcConnectionSummary[];
  notice?: string | null;
}): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nwc', subcommand: 'list' },
    tree: stack(
      [
        ...(params.notice ? [textBlock(params.notice, 'info')] : []),
        ...(params.connections.length > 0
          ? params.connections.map(connectionCard)
          : [textBlock('No NWC connections configured.', 'muted')]),
        addConnectionForm(),
      ],
      'md',
    ),
  };
}

export function renderNwcDetailWeb(params: {
  title: string;
  lines: string[];
  tone?: 'default' | 'muted' | 'info' | 'success' | 'warning' | 'danger';
}): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nwc', subcommand: 'info' },
    tree: stack(
      [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold', tone: params.tone ?? 'default' },
          children: [textNode(params.title)],
        },
        ...params.lines.map((line) => textBlock(line)),
        row([button({ label: 'Back', action: commandAction('list') })], 'xs'),
      ],
      'sm',
    ),
  };
}
