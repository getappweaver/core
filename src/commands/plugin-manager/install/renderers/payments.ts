import { parseLightningInvoice } from '@src/payments/lightning-invoice';
import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { textBlock, textNode } from '@src/web/widgets';

import { offerStatus, parsePaymentOffer } from '../../payment-offers';

import type { PluginCatalogEntry } from '../handler';
import type { PurchaseAttempt, PurchaseIdentity } from '../payments';
import type { RestorationChallenge } from '../restoration';

export const pluginPurchaseTerms = [
  'One qualifying payment buys this app for the selected Nostr identity and includes all future versions. The wallet paying the invoice can be different from the identity owning the purchase.',
  'Your installed version keeps working if the author starts charging. Installing, reinstalling, or updating through the manager requires a purchase while the advertised offer is active. Declining an update leaves your current version untouched.',
  'Skipped updates may include security fixes or compatibility changes. Check the author’s release notes; this notice does not classify any particular update as a security patch.',
  'A valid earlier purchase remains usable across AppWeaver instances when you connect its purchasing identity. Payment is confirmed by a matching provider-signed Nostr zap receipt; missing receipts can be checked again without paying twice.',
  'Expired advertised offers do not require payment. Older unexpired offers remain redeemable within their signed windows. Historical free-version installation and detailed version comparisons are planned for phase 2.',
];

type PurchaseActionProps = {
  target: string;
  operation: string;
  identity: string | null;
  attempt: string | null;
};

function purchaseAction(props: PurchaseActionProps): WebAction {
  return {
    type: 'command',
    command: 'plugins',
    subcommand: 'install',
    arguments: { target: props.target },
    options: {
      operation: props.operation,
      ...(props.identity ? { identity: props.identity } : {}),
      ...(props.attempt ? { attempt: props.attempt } : {}),
    },
    surface: 'modal',
    modalTitle: 'App purchase',
    recordInTimeline: false,
  };
}

function termsDisclosure(): WebNode {
  return {
    type: 'element',
    tag: 'details',
    children: [
      {
        type: 'element',
        tag: 'summary',
        children: [textNode('Purchase terms & update consequences')],
      },
      {
        type: 'element',
        tag: 'stack',
        props: { gap: 'sm' },
        children: pluginPurchaseTerms.map((line) => textBlock(line, 'muted')),
      },
    ],
  };
}

export function paymentLabel(entry: PluginCatalogEntry): string {
  const payment = entry.payment;

  if (!payment) {
    return 'Payment status not loaded';
  }

  if (payment.purchased) {
    return 'Purchased';
  }

  if (payment.status === 'unavailable') {
    return 'Offer unavailable · check purchase';
  }

  if (payment.status === 'free') {
    return 'Free';
  }

  if (payment.status === 'expired') {
    return 'Free · offer expired';
  }

  return `${Number(payment.offer?.price).toLocaleString('en-US')} sats · ${payment.status === 'upcoming' ? 'upcoming · free now' : 'one-time'}`;
}

export function renderPurchaseInfo(entry: PluginCatalogEntry): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'install' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'sm' },
      children: [
        textBlock(`${entry.title || entry.name} · ${paymentLabel(entry)}`),
        ...pluginPurchaseTerms.map((line) => textBlock(line, 'muted')),
        ...(entry.payment?.offer
          ? [
              {
                type: 'element' as const,
                tag: 'timestamp' as const,
                props: {
                  timestampMs: entry.payment.offer.validFrom * 1000,
                  label: 'Offer starts: ',
                },
              },
              {
                type: 'element' as const,
                tag: 'timestamp' as const,
                props: {
                  timestampMs: entry.payment.offer.validUntil * 1000,
                  label: 'Offer ends: ',
                },
              },
            ]
          : []),
      ],
    },
  };
}

export function renderFreeVersionNotice(
  entry: PluginCatalogEntry,
): WebNodeRoot {
  const updating = entry.installedAlias !== null;

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'install' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'sm' },
      children: [
        textBlock(
          `${entry.title || entry.name} · ${entry.compatibleRef?.tag ?? ''}`,
        ),
        textBlock(
          'This version is free. The author may charge for future releases. Your installed version will remain usable if pricing changes.',
          'muted',
        ),
        {
          type: 'element',
          tag: 'row',
          props: { gap: 'sm' },
          children: [
            {
              type: 'element',
              tag: 'button',
              props: {
                label: updating ? 'Continue update' : 'Continue installation',
                className: 'web-button',
                action: {
                  type: 'command',
                  command: 'plugins',
                  subcommand: 'install',
                  arguments: { target: entry.id },
                  options: { operation: 'free-confirm' },
                  surface: 'modal',
                  modalTitle: 'Free version notice',
                  recordInTimeline: false,
                  clientStatus: {
                    pending: updating ? 'Updating app...' : 'Installing app...',
                    restarting: 'Restarting AppWeaver...',
                  },
                },
              },
            },
            {
              type: 'element',
              tag: 'button',
              props: {
                label: 'Cancel',
                className: 'web-button',
                action: {
                  type: 'clientAction',
                  action: 'web.closeModal',
                  payload: {},
                },
              },
            },
          ],
        },
      ],
    },
  };
}

type RenderRestorationChallengeProps = {
  entry: PluginCatalogEntry;
  identity: PurchaseIdentity;
  challenge: RestorationChallenge;
};

export function renderRestorationChallenge({
  entry,
  identity,
  challenge,
}: RenderRestorationChallengeProps): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'install' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'sm' },
      children: [
        textBlock(`Restore ${entry.title || entry.name}`),
        textBlock(`Purchase found for ${identity.label}`, 'success'),
        textBlock(
          'Approve a fresh signing challenge to prove access to the identity that owns this receipt. Nothing is published and no payment is requested.',
          'muted',
        ),
        {
          type: 'element',
          tag: 'timestamp',
          props: {
            timestampMs: challenge.expiresAt * 1000,
            label: 'Challenge expires: ',
            tone: 'muted',
          },
        },
        {
          type: 'element',
          tag: 'row',
          props: { gap: 'sm' },
          children: [
            {
              type: 'element',
              tag: 'button',
              props: {
                label: 'Verify signing access & continue',
                className: 'web-button',
                action: {
                  type: 'clientAction',
                  action: 'nostr.signEvent',
                  payload: {
                    signingMode: 'immediate',
                    kind: challenge.template.kind,
                    content: challenge.template.content,
                    tags: challenge.template.tags,
                    signTitle: `Restore ${entry.title || entry.name}: prove signing access (no payment)`,
                    statusTitle: 'Restoration challenge signed',
                    onSuccessCommand: {
                      command: 'plugins',
                      subcommand: 'install',
                      arguments: { target: entry.id },
                      options: {
                        operation: 'restore',
                        identity: identity.id,
                        challenge: challenge.id,
                      },
                    },
                  },
                },
              },
            },
            {
              type: 'element',
              tag: 'button',
              props: {
                label: 'Cancel',
                className: 'web-button',
                action: {
                  type: 'clientAction',
                  action: 'web.closeModal',
                  payload: {},
                },
              },
            },
          ],
        },
      ],
    },
  };
}

type RenderPurchaseCheckoutProps = {
  entry: PluginCatalogEntry;
  identities: PurchaseIdentity[];
  identity: PurchaseIdentity | null;
  attempt: PurchaseAttempt | null;
  notice: string | null;
};

export function renderPurchaseCheckout(
  props: RenderPurchaseCheckoutProps,
): WebNodeRoot {
  const { entry, identities, identity, attempt, notice } = props;

  const children: WebNode[] = [
    textBlock(`${entry.title || entry.name} · ${paymentLabel(entry)}`),
    ...(entry.installedAlias
      ? [
          textBlock(
            'Your installed version remains usable. Purchase or restore ownership to update.',
            'muted',
          ),
        ]
      : []),
    termsDisclosure(),
    ...(notice ? [textBlock(notice, 'warning')] : []),
    {
      type: 'element',
      tag: 'form',
      props: {
        formOptionFieldNames: ['identity'],
        action: purchaseAction({
          target: entry.id,
          operation: 'check',
          identity: null,
          attempt: null,
        }),
      },
      children: [
        textBlock('Purchase identity', 'muted'),
        {
          type: 'element',
          tag: 'select',
          props: {
            formFieldName: 'identity',
            choices: identities.map((item) => item.id),
            choiceLabels: Object.fromEntries(
              identities.map((item) => [item.id, item.label]),
            ),
            value: identity?.id ?? identities[0]?.id ?? '',
          },
        },
        textBlock(
          'Choose the identity that paid previously, or that should own this purchase. Restoring a purchase requires a fresh signing proof before installation/update.',
          'muted',
        ),
        {
          type: 'element',
          tag: 'button',
          props: {
            label: 'Check purchases & continue',
            className: 'web-button',
            htmlType: 'submit',
            disabled: identities.length === 0,
          },
        },
      ],
    },
    {
      type: 'element',
      tag: 'button',
      props: {
        label: 'Bunker manager',
        className: 'web-button',
        action: {
          type: 'command',
          command: 'bunker',
          subcommand: 'list',
          arguments: {},
          options: {},
          surface: 'modal',
          modalTitle: 'Bunker identities',
          recordInTimeline: false,
        },
      },
    },
  ];

  if (identity && attempt) {
    const offer = parsePaymentOffer(attempt.offer, attempt.app);

    if (offer) {
      children.push(
        textBlock(
          `Purchase for ${identity.label} · ${offer.price} sats · one-time, all future versions`,
          'muted',
        ),
      );

      const payAction = purchaseAction({
        target: entry.id,
        operation: 'pay',
        identity: identity.id,
        attempt: attempt.id,
      });

      const signAction: WebAction =
        identity.id === 'authenticated' && !attempt.request
          ? {
              type: 'clientAction',
              action: 'nostr.signEvent',
              payload: {
                signingMode: 'immediate',
                kind: 9734,
                content: attempt.template.content,
                tags: attempt.template.tags,
                signTitle: `Buy ${entry.title || entry.name} for ${offer.price} sats`,
                statusTitle: 'Purchase zap request signed',
                onSuccessCommand: {
                  command: 'plugins',
                  subcommand: 'install',
                  arguments: { target: entry.id },
                  options: {
                    operation: 'pay',
                    identity: identity.id,
                    attempt: attempt.id,
                  },
                },
              },
            }
          : payAction;

      let expiredInvoice = offerStatus(offer) !== 'active';

      if (attempt.invoice) {
        try {
          expiredInvoice =
            expiredInvoice ||
            parseLightningInvoice(attempt.invoice).expiresAt <=
              Math.floor(Date.now() / 1000);
        } catch {
          expiredInvoice = true;
        }

        children.push(
          textBlock(
            'An invoice already exists. If your wallet paid, use Check receipt; do not pay it twice.',
            'muted',
          ),
        );

        children.push({
          type: 'element',
          tag: 'button',
          props: {
            label: 'Check receipt',
            className: 'web-button',
            action: purchaseAction({
              target: entry.id,
              operation: 'check',
              identity: identity.id,
              attempt: attempt.id,
            }),
          },
        });
      }

      if (!expiredInvoice) {
        children.push({
          type: 'element',
          tag: 'button',
          props: {
            label: attempt.invoice
              ? 'Pay existing invoice'
              : `Buy & ${entry.installedAlias ? 'update' : 'install'} · ${offer.price} sats`,
            className: 'web-button',
            tone: 'warning',
            action: signAction,
          },
        });
      } else {
        children.push({
          type: 'element',
          tag: 'button',
          props: {
            label: 'Start new payment (only if unpaid)',
            className: 'web-button',
            tone: 'warning',
            action: purchaseAction({
              target: entry.id,
              operation: 'new-payment',
              identity: identity.id,
              attempt: null,
            }),
          },
        });
      }
    }
  }

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'install' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'sm', className: 'plugin-purchase-checkout' },
      children,
    },
    stylesheets: [
      {
        id: 'plugin-purchase-checkout',
        cssText:
          '.plugin-purchase-checkout .web-form { display: grid; gap: .4rem; } .plugin-purchase-checkout summary { cursor: pointer; color: var(--color-text-muted); }',
      },
    ],
  };
}
