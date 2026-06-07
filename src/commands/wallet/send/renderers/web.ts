import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

import type { WalletSendRepresentation } from '../representation';

const walletSendStylesheet = {
  id: 'wallet-send-web',
  cssText: `
    .web-box.wallet-result-card {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 92%, transparent);
    }

    .wallet-token-output {
      max-height: 12rem;
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

function copyAction(text: string): WebAction {
  return {
    type: 'clientAction',
    action: 'clipboard.writeText',
    payload: { text },
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

export function renderWalletSendWeb(
  representation: WalletSendRepresentation,
): WebNodeRoot {
  const d = representation.data;

  const body = (() => {
    switch (d.view) {
      case 'token':
        return stack(
          [
            title('Cashu token created', 'success'),
            {
              type: 'element',
              tag: 'text',
              props: {
                className: 'wallet-token-output',
                whiteSpace: 'pre-wrap',
              },
              children: [textNode(d.token)],
            },
            row(
              [
                button({
                  label: 'Copy token',
                  tone: 'success',
                  action: copyAction(d.token),
                }),
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
            title('Send failed', 'danger'),
            textBlock(d.message, 'danger'),
            button({
              label: 'Back to wallet',
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
              `Usage: ${d.prefix}wallet send <sats> [--mint <url>]`,
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
      case 'no-mint':
        return stack(
          [
            textBlock(
              `No mint configured. Set one with: ${d.prefix}wallet mint <url>`,
              'warning',
            ),
            button({
              label: 'Back to wallet',
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
    meta: { command: 'wallet', subcommand: 'send' },
    stylesheets: [walletSendStylesheet],
    tree: {
      type: 'element',
      tag: 'box',
      props: { className: 'wallet-result-card', padding: 'md' },
      children: [body],
    },
  };
}
