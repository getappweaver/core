import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

import type { WalletReceiveRepresentation } from '../representation';

const walletReceiveStylesheet = {
  id: 'wallet-receive-web',
  cssText: `
    .web-box.wallet-result-card {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 92%, transparent);
    }

    .wallet-result-mint {
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

export function renderWalletReceiveWeb(
  representation: WalletReceiveRepresentation,
): WebNodeRoot {
  const d = representation.data;

  const body = (() => {
    switch (d.view) {
      case 'success':
        return stack(
          [
            title(`Received ${sats(d.receivedSats)}`, 'success'),
            {
              type: 'element',
              tag: 'text',
              props: { className: 'wallet-result-mint', tone: 'muted' },
              children: [textNode(d.mintUrl)],
            },
            ...(d.feeSats > 0
              ? [textBlock(`Fee: ${sats(d.feeSats)}`, 'muted')]
              : []),
            row(
              [
                button({
                  label: 'Back to wallet',
                  tone: null,
                  action: commandAction('list'),
                }),
              ],
              'xs',
            ),
          ],
          'sm',
        );
      case 'failure':
        return stack(
          [
            title('Receive failed', 'danger'),
            textBlock(d.message, 'danger'),
            button({
              label: 'Back to wallet',
              tone: null,
              action: commandAction('list'),
            }),
          ],
          'sm',
        );
      case 'usage':
        return stack(
          [
            title('Paste a Cashu token', 'warning'),
            textBlock(
              `Usage: ${d.prefix}wallet receive <cashu-token>`,
              'muted',
            ),
            button({
              label: 'Back to wallet',
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
      default: {
        const _exhaustive: never = d;

        return _exhaustive;
      }
    }
  })();

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'wallet', subcommand: 'receive' },
    stylesheets: [walletReceiveStylesheet],
    tree: {
      type: 'element',
      tag: 'box',
      props: { className: 'wallet-result-card', padding: 'md' },
      children: [body],
    },
  };
}
