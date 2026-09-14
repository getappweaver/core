import type { NwcConnectionSummary } from '@src/nwc/state';
import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { row, stack, textBlock } from '@src/web/widgets';

export type WalletOverviewNwc = {
  summary: NwcConnectionSummary;
  availability: 'available' | 'unavailable';
  balance: string | null;
};

type WalletOverview = {
  nwc: WalletOverviewNwc[];
  cashu: Array<{
    mintUrl: string;
    balance: number;
    isDefault: boolean;
  }> | null;
};

function ownerAction(command: 'nwc' | 'cashu'): WebAction {
  return {
    type: 'command',
    command,
    subcommand: 'list',
    arguments: {},
    options: {},
    recordInTimeline: false,
    surface: 'modal',
    modalTitle: command === 'nwc' ? 'NWC Wallets' : 'Cashu Wallet',
  };
}

function button(label: string, action: WebAction): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: { label, action },
  };
}

function tabPanel(params: {
  id: string;
  label: string;
  body: WebNode[];
  action?: WebNode;
}): WebNode {
  return {
    type: 'element',
    tag: 'tabPanel',
    props: {
      id: params.id,
      label: params.label,
      padding: 'md',
      className: 'wallet-overview-panel',
    },
    children: [
      stack(
        [
          ...params.body,
          ...(params.action ? [row([params.action], 'xs')] : []),
        ],
        'sm',
      ),
    ],
  };
}

function nwcSection(items: WalletOverviewNwc[]): WebNode {
  const body =
    items.length === 0
      ? [textBlock('No NWC connections configured.', 'muted')]
      : items.map(({ summary, availability, balance }) => {
          const identity = summary.walletAlias
            ? `${summary.label} (${summary.walletAlias})`
            : summary.label;

          const verification = summary.verifiedAt
            ? 'Verified connection'
            : 'Unverified connection';

          const detail =
            availability === 'available'
              ? balance === null
                ? 'Available, balance unavailable'
                : `Available, ${balance} sats`
              : 'Currently unavailable';

          return stack(
            [
              textBlock(identity),
              textBlock(verification, summary.verifiedAt ? 'muted' : 'warning'),
              textBlock(
                detail,
                availability === 'available' ? 'success' : 'warning',
              ),
            ],
            'xs',
          );
        });

  return tabPanel({
    id: 'wallet-nwc',
    label: 'NWC',
    body,
    action: button('Manage NWC', ownerAction('nwc')),
  });
}

function cashuSection(mints: WalletOverview['cashu']): WebNode {
  let body: WebNode[];

  if (mints === null) {
    body = [textBlock('Cashu wallet is not configured.', 'warning')];
  } else if (mints.length === 0) {
    body = [textBlock('No Cashu mints found.', 'muted')];
  } else {
    body = mints.map((mint) =>
      stack(
        [
          textBlock(`${mint.mintUrl}${mint.isDefault ? ' (default)' : ''}`),
          textBlock(`${mint.balance.toLocaleString()} sats`, 'success'),
        ],
        'xs',
      ),
    );
  }

  return tabPanel({
    id: 'wallet-cashu',
    label: 'Cashu',
    body,
    action: button('Open Cashu', ownerAction('cashu')),
  });
}

export function renderWalletOverviewWeb(overview: WalletOverview): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'wallet', subcommand: 'list' },
    stylesheets: [
      {
        id: 'wallet-overview',
        cssText: `
          .web-tabPanel.wallet-overview-panel {
            border-color: color-mix(in srgb, var(--color-border, currentColor) 70%, transparent);
            background: color-mix(in srgb, var(--color-panel, #242424) 86%, transparent);
          }
        `,
      },
    ],
    tree: {
      type: 'element',
      tag: 'tabs',
      props: { defaultActiveTabId: 'wallet-webln' },
      children: [
        tabPanel({
          id: 'wallet-webln',
          label: 'WebLN',
          body: [
            {
              type: 'element',
              tag: 'browserWallet',
            },
          ],
        }),
        nwcSection(overview.nwc),
        cashuSection(overview.cashu),
      ],
    },
  };
}

export function renderWalletOverviewText(
  overview: WalletOverview,
  prefix: string,
): string {
  const nwc = overview.nwc.map(
    ({ summary, availability, balance }) =>
      `${summary.label}: ${summary.verifiedAt ? 'verified' : 'unverified'}, ${availability}${balance === null ? '' : `, ${balance} sats`}`,
  );

  const cashu =
    overview.cashu?.map(
      (mint) => `${mint.mintUrl}: ${mint.balance.toLocaleString()} sats`,
    ) ?? [];

  return [
    'WebLN: browser-specific; open this command in the web UI.',
    '',
    'NWC:',
    ...(nwc.length > 0 ? nwc : ['No connections configured.']),
    '',
    'Cashu:',
    ...(overview.cashu === null
      ? ['Not configured.']
      : cashu.length > 0
        ? cashu
        : ['No mints found.']),
    '',
    `Manage with ${prefix}nwc list and ${prefix}cashu list.`,
  ].join('\n');
}
