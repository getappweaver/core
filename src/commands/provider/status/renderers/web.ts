import { formatMsats, msats } from '@src/types';
import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

import type { ProviderStatusRepresentation } from '../representation';

const routstrStatusStylesheet = {
  id: 'routstr-status-web',
  cssText: `
    .web-box.routstr-status-card {
      border: 0;
      background: transparent;
    }

    .web-box.routstr-panel,
    .web-box.routstr-mint-row {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 88%, transparent);
      padding: 0.45rem 0.55rem;
    }

    .web-box.routstr-mint-row {
      border-left: 2px solid transparent;
    }

    .web-box.routstr-mint-row--default {
      border-left-color: var(--color-warning, currentColor);
    }

    .routstr-label {
      color: var(--color-text-muted);
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .routstr-mint-url {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .web-row.routstr-deposit-form-row,
    .web-row.routstr-actions-row {
      align-items: center;
    }

    .web-row.routstr-deposit-form-row .web-text-field {
      width: 7rem;
    }
  `,
} as const;

function refreshStatus(): NonNullable<
  Extract<WebAction, { type: 'command' }>['refresh']
> {
  return {
    command: 'routstr',
    subcommand: 'status',
    arguments: {},
    options: {},
    recordInTimeline: false,
  };
}

function commandAction(params: {
  subcommand: string;
  arguments: Record<string, unknown>;
  options: Record<string, unknown>;
}): WebAction {
  return {
    type: 'command',
    command: 'routstr',
    subcommand: params.subcommand,
    arguments: params.arguments,
    options: params.options,
    recordInTimeline: false,
    refresh: refreshStatus(),
  };
}

function label(value: string): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: { className: 'routstr-label' },
    children: [textNode(value)],
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

function kv(key: string, value: string, tone: WebTone = 'muted'): WebNode {
  return row([label(key), textBlock(value, tone)], 'xs');
}

function sats(value: number): string {
  return `${value.toLocaleString()} sats`;
}

function panel(children: WebNode[]): WebNode {
  return {
    type: 'element',
    tag: 'box',
    props: { className: 'routstr-panel' },
    children: [stack(children, 'xs')],
  };
}

function mintRows(
  mints: ProviderStatusRepresentation['data'] extends { walletMints: infer M }
    ? M
    : never,
): WebNode {
  if (mints.length === 0) {
    return textBlock('No wallet mints with tracked funds yet.', 'muted');
  }

  return stack(
    mints.map((mint) => ({
      type: 'element' as const,
      tag: 'box' as const,
      props: {
        className: mint.isDefault
          ? 'routstr-mint-row routstr-mint-row--default'
          : 'routstr-mint-row',
      },
      children: [
        stack(
          [
            {
              type: 'element' as const,
              tag: 'text' as const,
              props: { className: 'routstr-mint-url' },
              children: [textNode(mint.mintUrl)],
            },
            textBlock(
              `${mint.isDefault ? 'Default mint | ' : ''}Balance: ${sats(mint.totalSats)}`,
              mint.totalSats > 0 ? 'success' : 'muted',
            ),
          ],
          'xs',
        ),
      ],
    })),
    'xs',
  );
}

function depositForm(
  d: Extract<ProviderStatusRepresentation['data'], { view: 'status' }>,
): WebNode {
  const fundedMints = d.walletMints.filter((mint) => mint.totalSats > 0);
  const canDeposit = d.hasMnemonic && d.hasWalletDb && fundedMints.length > 0;
  const choices = fundedMints.map((mint) => mint.mintUrl);

  const choiceLabels = Object.fromEntries(
    fundedMints.map((mint) => [
      mint.mintUrl,
      `${mint.mintUrl} (${sats(mint.totalSats)})`,
    ]),
  );

  return panel([
    title('Deposit to Routstr', canDeposit ? 'success' : 'warning'),
    ...(canDeposit
      ? []
      : [
          textBlock(
            !d.hasMnemonic
              ? 'Cashu mnemonic is not configured yet.'
              : !d.hasWalletDb
                ? 'Wallet DB is not available.'
                : 'Receive funds into a wallet mint before depositing.',
            'warning' as const,
          ),
        ]),
    {
      type: 'element',
      tag: 'form',
      props: {
        formOptionFieldNames: ['mint'],
        action: commandAction({
          subcommand: 'deposit',
          arguments: {},
          options: {},
        }),
      },
      children: [
        {
          type: 'element',
          tag: 'row',
          props: {
            gap: 'sm',
            itemAlign: 'stretch',
            className: 'routstr-deposit-form-row',
          },
          children: [
            {
              type: 'element',
              tag: 'textField',
              props: {
                formFieldName: 'sats',
                inputPlaceholder: 'sats',
                disabled: !canDeposit,
              },
            },
            {
              type: 'element',
              tag: 'select',
              props: {
                formFieldName: 'mint',
                choices,
                choiceLabels,
                value: choices[0] ?? '',
                disabled: !canDeposit,
              },
            },
            {
              type: 'element',
              tag: 'button',
              props: {
                label: 'Deposit',
                tone: canDeposit ? 'success' : 'muted',
                className: 'web-button',
                htmlType: 'submit',
                disabled: !canDeposit,
              },
            },
          ],
        },
      ],
    },
  ]);
}

function refundButton(hasSessionKey: boolean): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: {
      label: 'Refund',
      tone: hasSessionKey ? 'warning' : 'muted',
      className: 'web-button',
      disabled: !hasSessionKey,
      action: commandAction({
        subcommand: 'refund',
        arguments: {},
        options: {},
      }),
    },
  };
}

export function renderProviderStatusWeb(
  representation: ProviderStatusRepresentation,
): WebNodeRoot {
  const d = representation.data;

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'routstr', subcommand: 'status' },
    stylesheets: [routstrStatusStylesheet],
    tree: {
      type: 'element',
      tag: 'box',
      props: { className: 'routstr-status-card', padding: 'md' },
      children: [
        stack(
          [
            title(
              'Routstr Status',
              d.providerName === 'routstr' ? 'success' : 'muted',
            ),
            panel([
              kv(
                'Provider',
                d.providerName,
                d.providerName === 'routstr' ? 'success' : 'muted',
              ),
              kv(
                'Session',
                d.sessionKeyShort ? `${d.sessionKeyShort}...` : 'none',
              ),
              kv(
                'Routstr balance',
                d.routstrBalanceMsatsRaw == null
                  ? (d.routstrBalanceError ?? 'unknown')
                  : formatMsats(msats(d.routstrBalanceMsatsRaw)),
                d.routstrBalanceMsatsRaw == null ? 'muted' : 'success',
              ),
              kv('Budget', formatMsats(msats(d.budgetMsatsRaw))),
              kv('Model', d.modelId ? `routstr/${d.modelId}` : 'not set'),
            ]),
            panel([
              title(
                'Wallet Funds',
                d.walletTotalSats > 0 ? 'success' : 'warning',
              ),
              kv(
                'Total',
                sats(d.walletTotalSats),
                d.walletTotalSats > 0 ? 'success' : 'muted',
              ),
              kv('Default mint', d.defaultMintUrl ?? 'not set'),
              mintRows(d.walletMints),
            ]),
            depositForm(d),
            {
              type: 'element',
              tag: 'row',
              props: { gap: 'xs', className: 'routstr-actions-row' },
              children: [refundButton(d.hasSessionKey)],
            },
          ],
          'md',
        ),
      ],
    },
  };
}
