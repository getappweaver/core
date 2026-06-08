import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { stack, textBlock, textNode } from '@src/web/widgets';

import type { WalletListRepresentation } from '../representation';

const walletListStylesheet = {
  id: 'wallet-list-web',
  cssText: `
    .web-box.wallet-widget {
      border: 0;
      background: transparent;
    }

    .web-box.wallet-mint-row-box {
      border-left: 2px solid transparent;
      padding: 0.45rem 0.55rem;
    }

    .web-box.wallet-mint-row-box:nth-child(even) {
      background: rgba(255, 255, 255, 0.05);
    }

    .web-box.wallet-mint-row-box--default {
      border-left-color: var(--color-warning, currentColor);
      background: color-mix(in srgb, var(--color-warning, currentColor) 8%, transparent);
    }

    .wallet-mint-url {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .wallet-mint-balance {
      white-space: nowrap;
    }

    .web-row.wallet-send-form-row,
    .web-row.wallet-receive-form-row,
    .web-row.wallet-global-actions {
      align-items: center;
    }

    .web-row.wallet-send-form-row .web-text-field {
      width: 7rem;
    }

    .web-row.wallet-receive-form-row {
      width: 100%;
    }

    .web-box.wallet-receive-panel {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 88%, transparent);
      padding: 0.45rem 0.55rem;
    }

    .wallet-panel-title {
      color: var(--color-text-muted);
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
  `,
} as const;

function text(value: string, tone?: WebTone): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: tone ? { tone } : {},
    children: [textNode(value)],
  };
}

function sats(value: number): string {
  return `${value.toLocaleString()} sats`;
}

function commandAction(params: {
  subcommand: string;
  arguments: Record<string, unknown>;
  options: Record<string, unknown>;
  presentation: 'run' | 'form';
  surface: 'timeline' | 'modal' | null;
  modalTitle: string | null;
  recordInTimeline: boolean;
}): WebAction {
  return {
    type: 'command',
    command: 'wallet',
    subcommand: params.subcommand,
    arguments: params.arguments,
    options: params.options,
    presentation: params.presentation,
    ...(params.surface ? { surface: params.surface } : {}),
    ...(params.modalTitle ? { modalTitle: params.modalTitle } : {}),
    recordInTimeline: params.recordInTimeline,
  };
}

function submitCommandAction(params: {
  subcommand: string;
  arguments: Record<string, unknown>;
  options: Record<string, unknown>;
  presentation?: 'run' | 'form';
}): WebAction {
  return {
    type: 'command',
    command: 'wallet',
    subcommand: params.subcommand,
    arguments: params.arguments,
    options: params.options,
    ...(params.presentation ? { presentation: params.presentation } : {}),
    recordInTimeline: false,
  };
}

function mintSendForm(item: { mintUrl: string; totalSats: number }): WebNode {
  return {
    type: 'element',
    tag: 'form',
    props: {
      action: commandAction({
        subcommand: 'send',
        arguments: {},
        options: { mint: item.mintUrl },
        presentation: 'run',
        surface: null,
        modalTitle: null,
        recordInTimeline: false,
      }),
    },
    children: [
      {
        type: 'element',
        tag: 'row',
        props: {
          gap: 'xs',
          itemAlign: 'stretch',
          className: 'wallet-send-form-row',
        },
        children: [
          {
            type: 'element',
            tag: 'textField',
            props: {
              formFieldName: 'sats',
              inputPlaceholder: 'sats',
            },
          },
          {
            type: 'element',
            tag: 'button',
            props: {
              label: 'Send',
              tone: item.totalSats > 0 ? 'warning' : 'muted',
              className: 'web-button',
              htmlType: 'submit',
              disabledUntilFormFieldPositiveInteger: 'sats',
            },
          },
          {
            type: 'element',
            tag: 'button',
            props: {
              label: 'Mint',
              tone: item.totalSats > 0 ? 'warning' : 'muted',
              className: 'web-button',
              htmlType: 'submit',
              disabledUntilFormFieldPositiveInteger: 'sats',
              submitAction: submitCommandAction({
                subcommand: 'pay',
                arguments: {},
                options: { mint: item.mintUrl },
              }),
            },
          },
          {
            type: 'element',
            tag: 'button',
            props: {
              label: 'Melt',
              tone: item.totalSats > 0 ? 'warning' : 'muted',
              className: 'web-button',
              htmlType: 'submit',
              disabledUntilFormFieldPositiveInteger: 'sats',
              submitAction: submitCommandAction({
                subcommand: 'melt',
                arguments: {},
                options: { mint: item.mintUrl },
                presentation: 'form',
              }),
            },
          },
        ],
      },
    ],
  };
}

function mintRow(item: {
  mintUrl: string;
  totalSats: number;
  isDefault: boolean;
}): WebNode {
  return {
    type: 'element',
    tag: 'box',
    props: {
      className: item.isDefault
        ? 'wallet-mint-row-box wallet-mint-row-box--default'
        : 'wallet-mint-row-box',
    },
    children: [
      stack(
        [
          {
            type: 'element',
            tag: 'text',
            props: { className: 'wallet-mint-url' },
            children: [textNode(item.mintUrl)],
          },
          {
            type: 'element',
            tag: 'text',
            props: {
              className: 'wallet-mint-balance',
              tone: item.totalSats > 0 ? 'success' : 'muted',
              size: 'sm',
            },
            children: [textNode(`Balance: ${sats(item.totalSats)}`)],
          },
          mintSendForm(item),
        ],
        'xs',
      ),
    ],
  };
}

function noWalletBody(): WebNode {
  return stack(
    [
      textBlock('Cashu wallet is not configured yet.', 'warning'),
      textBlock(
        'Open setup and configure a wallet mnemonic to use this widget.',
        'muted',
      ),
    ],
    'sm',
  );
}

function receiveForm(): WebNode {
  return {
    type: 'element',
    tag: 'box',
    props: {
      className: 'wallet-receive-panel',
    },
    children: [
      stack(
        [
          {
            type: 'element',
            tag: 'text',
            props: { className: 'wallet-panel-title' },
            children: [textNode('Receive token')],
          },
          {
            type: 'element',
            tag: 'form',
            props: {
              action: commandAction({
                subcommand: 'receive',
                arguments: {},
                options: {},
                presentation: 'run',
                surface: null,
                modalTitle: null,
                recordInTimeline: false,
              }),
            },
            children: [
              {
                type: 'element',
                tag: 'row',
                props: {
                  gap: 'sm',
                  itemAlign: 'stretch',
                  className: 'wallet-receive-form-row',
                },
                children: [
                  {
                    type: 'element',
                    tag: 'textField',
                    props: {
                      formFieldName: 'token',
                      inputPlaceholder: 'Paste Cashu token',
                      fill: true,
                    },
                  },
                  {
                    type: 'element',
                    tag: 'button',
                    props: {
                      label: 'Receive',
                      tone: 'success',
                      className: 'web-button',
                      htmlType: 'submit',
                    },
                  },
                ],
              },
            ],
          },
        ],
        'sm',
      ),
    ],
  };
}

function historyAction(): WebNode {
  return {
    type: 'element',
    tag: 'row',
    props: { gap: 'xs', className: 'wallet-global-actions' },
    children: [
      {
        type: 'element',
        tag: 'button',
        props: {
          label: 'History',
          className: 'web-button',
          action: commandAction({
            subcommand: 'history',
            arguments: {},
            options: {},
            presentation: 'run',
            surface: null,
            modalTitle: null,
            recordInTimeline: false,
          }),
        },
      },
    ],
  };
}

function footerActions(): WebNode {
  return stack([receiveForm(), historyAction()], 'sm');
}

export function renderWalletListWeb(
  representation: WalletListRepresentation,
): WebNodeRoot {
  const d = representation.data;
  const hasMints = d.view === 'list' && d.items.length > 0;

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'wallet', subcommand: 'list' },
    stylesheets: [walletListStylesheet],
    tree: {
      type: 'element',
      tag: 'box',
      props: { className: 'wallet-widget', padding: 'md' },
      children: [
        stack(
          [
            text(
              d.view === 'list'
                ? `${sats(d.totalSats)} across ${d.items.length} mint${d.items.length === 1 ? '' : 's'}`
                : 'not configured',
              d.view === 'list' ? 'success' : 'warning',
            ),
            d.view === 'no-wallet-db'
              ? noWalletBody()
              : stack(
                  [
                    hasMints
                      ? stack(d.items.map(mintRow), 'xs')
                      : textBlock('No mints found yet.', 'muted'),
                    footerActions(),
                  ],
                  'md',
                ),
          ],
          'md',
        ),
      ],
    },
  };
}
