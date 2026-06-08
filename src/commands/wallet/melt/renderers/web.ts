import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

import type { WalletMeltRepresentation } from '../representation';

const walletMeltStylesheet = {
  id: 'wallet-melt-web',
  cssText: `
    .web-box.wallet-result-card {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 92%, transparent);
    }

    .wallet-melt-mint-url,
    .wallet-melt-preimage {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .wallet-melt-invoice .web-textArea__input {
      width: 100%;
      box-sizing: border-box;
    }
  `,
} as const;

function commandAction(
  subcommand: string,
  options?: Record<string, unknown>,
): WebAction {
  return {
    type: 'command',
    command: 'wallet',
    subcommand,
    arguments: {},
    options: options ?? {},
    recordInTimeline: false,
  };
}

function meltAction(params: {
  amountSats: number;
  mintUrl: string;
}): WebAction {
  return {
    type: 'command',
    command: 'wallet',
    subcommand: 'melt',
    arguments: { sats: params.amountSats },
    options: { mint: params.mintUrl },
    recordInTimeline: false,
  };
}

function button(params: {
  label: string;
  tone: WebTone | null;
  action?: WebAction;
  htmlType?: 'button' | 'submit';
}): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: {
      label: params.label,
      className: 'web-button',
      ...(params.tone ? { tone: params.tone } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.htmlType ? { htmlType: params.htmlType } : {}),
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

function invoiceForm(params: { amountSats: number; mintUrl: string }): WebNode {
  return {
    type: 'element',
    tag: 'form',
    props: {
      action: meltAction(params),
    },
    children: [
      stack(
        [
          {
            type: 'element',
            tag: 'textArea',
            props: {
              formFieldName: 'invoice',
              inputPlaceholder: 'Paste BOLT11 invoice',
              maxRows: 4,
              className: 'wallet-melt-invoice',
              autoFocus: true,
            },
          },
          row(
            [
              button({
                label: 'Melt',
                tone: 'warning',
                htmlType: 'submit',
              }),
              button({
                label: 'Close',
                tone: null,
                action: commandAction('list'),
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

export function renderWalletMeltWeb(
  representation: WalletMeltRepresentation,
): WebNodeRoot {
  const d = representation.data;

  const body = (() => {
    switch (d.view) {
      case 'invoice-form':
        return stack(
          [
            title(`Melt ${sats(d.amountSats)} to Lightning`, 'warning'),
            textBlock(
              'Paste a BOLT11 invoice created by your Lightning wallet. The invoice amount must match the sats value.',
              'muted',
            ),
            {
              type: 'element',
              tag: 'text',
              props: { className: 'wallet-melt-mint-url', tone: 'muted' },
              children: [textNode(d.mintUrl)],
            },
            invoiceForm({ amountSats: d.amountSats, mintUrl: d.mintUrl }),
          ],
          'sm',
        );
      case 'success':
        return stack(
          [
            title(`Melted ${sats(d.paidSats)} to Lightning`, 'success'),
            textBlock(`Mint: ${d.mintUrl}`, 'muted'),
            textBlock(`Fee: ${sats(d.feeSats)}`, 'muted'),
            textBlock(`Quote: ${d.quote}`, 'muted'),
            ...(d.paymentPreimage
              ? [
                  {
                    type: 'element' as const,
                    tag: 'text' as const,
                    props: {
                      className: 'wallet-melt-preimage',
                      tone: 'muted' as const,
                      size: 'sm' as const,
                    },
                    children: [textNode(`Preimage: ${d.paymentPreimage}`)],
                  },
                ]
              : []),
            button({
              label: 'Close',
              tone: null,
              action: commandAction('list'),
            }),
          ],
          'sm',
        );
      case 'failure':
        return stack(
          [
            title('Melt failed', 'danger'),
            textBlock(d.message, 'danger'),
            button({
              label: 'Close',
              tone: null,
              action: commandAction('list'),
            }),
          ],
          'sm',
        );
      case 'invalid-amount':
      case 'usage':
        return stack(
          [
            title('Enter an amount', 'warning'),
            textBlock(
              `Usage: ${d.prefix}wallet melt <sats> <bolt11-invoice> [--mint <url>]`,
              'muted',
            ),
            button({
              label: 'Close',
              tone: null,
              action: commandAction('list'),
            }),
          ],
          'sm',
        );
      case 'no-wallet-db':
        return textBlock('Wallet DB not available.', 'warning');
      case 'no-mnemonic':
        return textBlock(
          'No mnemonic configured. Set one in setup first.',
          'warning',
        );
      case 'no-mint':
        return stack(
          [
            textBlock(
              `No mint configured. Set one with: ${d.prefix}wallet mint <url>`,
              'warning',
            ),
            button({
              label: 'Close',
              tone: null,
              action: commandAction('list'),
            }),
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
    meta: { command: 'wallet', subcommand: 'melt' },
    stylesheets: [walletMeltStylesheet],
    tree: {
      type: 'element',
      tag: 'box',
      props: { className: 'wallet-result-card', padding: 'md' },
      children: [body],
    },
  };
}
