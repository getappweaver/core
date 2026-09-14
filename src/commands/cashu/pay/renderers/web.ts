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
    command: 'cashu',
    subcommand,
    arguments: {},
    options: options ?? {},
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
              'The core payment modal is opening for this mint quote.',
              'muted',
            ),
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
            ...(d.message ? [textBlock(d.message, 'warning')] : []),
            row(
              [
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
              `Usage: ${d.prefix}cashu pay <sats> [--mint <url>]`,
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
              `No mint configured. Set one with: ${d.prefix}cashu mint <url>`,
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
    meta: { command: 'cashu', subcommand: 'pay' },
    stylesheets: [walletPayStylesheet],
    tree: {
      type: 'element',
      tag: 'box',
      props: { className: 'wallet-result-card', padding: 'md' },
      children: [body],
    },
  };
}
