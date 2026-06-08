import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

import type { WalletPayRepresentation } from '../representation';

const walletPayStylesheet = {
  id: 'wallet-pay-web',
  cssText: `
    .web-box.wallet-result-card {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 92%, transparent);
    }

    .wallet-pay-qr {
      width: 12rem;
      max-width: 100%;
      display: block;
      margin: 0 auto;
      border: 1px solid var(--color-border, currentColor);
      background: #fff;
    }

    .wallet-pay-mint-url {
      text-align: center;
      word-break: break-all;
    }

    .wallet-pay-invoice {
      max-height: 12rem;
      overflow: auto;
      word-break: break-all;
    }

    .wallet-pay-invoice .web-textArea__input {
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

function copyAction(text: string): WebAction {
  return {
    type: 'clientAction',
    action: 'clipboard.writeText',
    payload: { text },
  };
}

function payInvoiceAction(params: {
  invoice: string;
  quote: string;
  mintUrl: string;
}): WebAction {
  return {
    type: 'clientAction',
    action: 'wallet.payInvoice',
    payload: {
      invoice: params.invoice,
    },
    refresh: {
      command: 'wallet',
      subcommand: 'pay',
      arguments: {},
      options: {
        mint: params.mintUrl,
        quote: params.quote,
        claim: true,
      },
      recordInTimeline: false,
    },
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

function invoiceField(invoice: string): WebNode {
  return {
    type: 'element',
    tag: 'textArea',
    props: {
      value: invoice,
      disabled: true,
      maxRows: 4,
      className: 'wallet-pay-invoice',
    },
  };
}

export function renderWalletPayWeb(
  representation: WalletPayRepresentation,
): WebNodeRoot {
  const d = representation.data;

  const body = (() => {
    switch (d.view) {
      case 'quote':
        return stack(
          [
            title(
              `Minting ${d.amountSats.toLocaleString()} sats with Lightning to receive a Cashu token`,
              'warning',
            ),
            textBlock(
              'Scan this QR code in your lightning wallet or copy and paste the invoice string.',
              'muted',
            ),
            {
              type: 'element',
              tag: 'image',
              props: {
                src: d.qrDataUri,
                alt: 'Lightning invoice QR code',
                className: 'wallet-pay-qr',
              },
            },
            {
              type: 'element',
              tag: 'text',
              props: { className: 'muted wallet-pay-mint-url' },
              children: [textNode(d.mintUrl)],
            },
            {
              type: 'element',
              tag: 'text',
              props: { tone: 'muted', className: 'wallet-pay-mint-url' },
              children: [textNode(`Quote: ${d.quote}`)],
            },
            invoiceField(d.invoice),
            ...(d.message ? [textBlock(d.message, 'warning')] : []),
            row(
              [
                button({
                  label: 'Mint with WebLN',
                  tone: 'success',
                  action: payInvoiceAction({
                    invoice: d.invoice,
                    quote: d.quote,
                    mintUrl: d.mintUrl,
                  }),
                }),
                button({
                  label: 'Copy invoice',
                  tone: null,
                  action: copyAction(d.invoice),
                }),
                button({
                  label: 'Check payment',
                  tone: 'warning',
                  action: commandAction('pay', {
                    mint: d.mintUrl,
                    quote: d.quote,
                    claim: true,
                  }),
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
        );
      case 'success':
        return stack(
          [
            title(`Minted ${d.receivedSats.toLocaleString()} sats`, 'success'),
            textBlock(`Mint: ${d.mintUrl}`, 'muted'),
            ...(d.feeSats > 0
              ? [textBlock(`Fee: ${d.feeSats.toLocaleString()} sats`, 'muted')]
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
            title('Mint failed', 'danger'),
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
              `Usage: ${d.prefix}wallet pay <sats> [--mint <url>]`,
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
    meta: { command: 'wallet', subcommand: 'pay' },
    stylesheets: [walletPayStylesheet],
    tree: {
      type: 'element',
      tag: 'box',
      props: { className: 'wallet-result-card', padding: 'md' },
      children: [body],
    },
  };
}
