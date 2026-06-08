import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

import type {
  WalletHistoryRepresentation,
  WalletHistoryRow,
} from '../representation';

const walletHistoryStylesheet = {
  id: 'wallet-history-web',
  cssText: `
    .web-box.wallet-history-card {
      border: 0;
      background: transparent;
    }

    .web-box.wallet-history-row {
      border-left: 2px solid transparent;
      padding: 0.45rem 0.55rem;
    }

    .web-box.wallet-history-row:nth-child(even) {
      background: rgba(255, 255, 255, 0.05);
    }

    .web-box.wallet-history-row--receive {
      border-left-color: var(--color-success, currentColor);
    }

    .web-box.wallet-history-row--send {
      border-left-color: var(--color-warning, currentColor);
    }

    .wallet-history-meta,
    .wallet-history-token {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .wallet-history-token {
      max-height: 7rem;
      overflow: auto;
      word-break: break-all;
    }
  `,
} as const;

function commandAction(subcommand: string): WebAction {
  return {
    type: 'command',
    command: 'wallet',
    subcommand,
    arguments: {},
    options: {},
    recordInTimeline: false,
  };
}

function button(params: {
  label: string;
  tone: WebTone | null;
  action: WebAction;
}): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: {
      label: params.label,
      className: 'web-button',
      ...(params.tone ? { tone: params.tone } : {}),
      action: params.action,
    },
  };
}

function title(value: string, tone: WebTone): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: { weight: 'semibold', tone },
    children: [textNode(value)],
  };
}

function sats(value: number): string {
  return `${value.toLocaleString()} sats`;
}

function operationTone(operation: string): WebTone {
  return operation === 'receive' ? 'success' : 'warning';
}

function historyKindLabel(kind: string | null): string | null {
  switch (kind) {
    case 'send':
      return 'send token';
    case 'melt':
      return 'melt invoice';
    case 'receive':
      return 'receive token';
    case 'mint':
      return 'mint token';
    default:
      return kind;
  }
}

function historyLabel(operation: string, kind: string | null): string {
  const kindLabel = historyKindLabel(kind);

  if (!kindLabel) {
    return operation;
  }

  return `${operation} · ${kindLabel}`;
}

function historyRow(item: WalletHistoryRow, showToken: boolean): WebNode {
  const tone = operationTone(item.operation);

  return {
    type: 'element',
    tag: 'box',
    props: {
      className: `wallet-history-row wallet-history-row--${item.operation}`,
    },
    children: [
      stack(
        [
          row(
            [
              title(historyLabel(item.operation, item.kind), tone),
              textBlock(
                `${sats(item.amount)} | ${sats(item.fee)} fee`,
                'muted',
              ),
            ],
            'xs',
          ),
          {
            type: 'element',
            tag: 'text',
            props: {
              className: 'wallet-history-meta',
              tone: 'muted',
              size: 'sm',
            },
            children: [textNode(`${item.dateDisplay} | ${item.shortMint}`)],
          },
          ...(showToken
            ? [
                {
                  type: 'element' as const,
                  tag: 'text' as const,
                  props: {
                    className: 'wallet-history-token',
                    tone: 'muted' as const,
                    size: 'sm' as const,
                    whiteSpace: 'pre-wrap' as const,
                  },
                  children: [textNode(item.token)],
                },
              ]
            : []),
        ],
        'xs',
      ),
    ],
  };
}

function backButton(): WebNode {
  return button({
    label: 'Back',
    tone: null,
    action: commandAction('list'),
  });
}

export function renderWalletHistoryWeb(
  representation: WalletHistoryRepresentation,
): WebNodeRoot {
  const d = representation.data;

  const body = (() => {
    switch (d.view) {
      case 'no-wallet-db':
        return stack(
          [textBlock('Wallet DB not available.', 'warning'), backButton()],
          'sm',
        );
      case 'empty':
        return stack(
          [title('No wallet history yet', 'muted'), backButton()],
          'sm',
        );
      case 'rows':
        return stack(
          [
            title('Recent wallet history', 'success'),
            stack(
              d.rows.map((item) => historyRow(item, d.showToken)),
              'xs',
            ),
            backButton(),
          ],
          'sm',
        );
      default: {
        const _exhaustive: never = d;

        return _exhaustive;
      }
    }
  })();

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'wallet', subcommand: 'history' },
    stylesheets: [walletHistoryStylesheet],
    tree: {
      type: 'element',
      tag: 'box',
      props: { className: 'wallet-history-card', padding: 'md' },
      children: [body],
    },
  };
}
