import { nip19, type EventTemplate } from 'nostr-tools';

import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { textBlock, textNode } from '@src/web/widgets';

import type { PluginCatalogEntry } from '../../install/handler';
import { offerStatus, type PaymentOffer } from '../../payment-offers';

import type { OfferRelayRecord } from '../offers';

type RenderOfferManagementProps = {
  alias: string;
  published: PluginCatalogEntry;
  offers: PaymentOffer[];
  notice: string | null;
  review: { id: string; template: EventTemplate } | null;
  releasePreview: WebNodeRoot | null;
  publicationRelays: string[];
  relayRecords: Record<string, OfferRelayRecord | null>;
};

type OfferActionProps = {
  alias: string;
  operation: string;
  options: Record<string, string>;
};

function offerAction({
  alias,
  operation,
  options,
}: OfferActionProps): WebAction {
  return {
    type: 'command',
    command: 'plugins',
    subcommand: 'publish',
    arguments: { alias },
    options: { operation, ...options },
    recordInTimeline: false,
    pendingUi: { presentation: 'widget', label: 'Loading publication…' },
  };
}

function stack(className: string, children: WebNode[]): WebNode {
  return { type: 'element', tag: 'stack', props: { className }, children };
}

function row(className: string, children: WebNode[]): WebNode {
  return { type: 'element', tag: 'row', props: { className }, children };
}

function heading(label: string): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: { className: 'offer-section-heading', weight: 'bold' },
    children: [textNode(label)],
  };
}

function link(href: string, label: string): WebNode {
  return {
    type: 'element',
    tag: 'link',
    props: { href },
    children: [textNode(label)],
  };
}

function eventLink(id: string, label: string): WebNode {
  return link(`nostr:${nip19.noteEncode(id)}`, label);
}

function disclosure(label: string, children: WebNode[]): WebNode {
  return {
    type: 'element',
    tag: 'details',
    props: { className: 'offer-details' },
    children: [
      { type: 'element', tag: 'summary', children: [textNode(label)] },
      stack('offer-details-body', children),
    ],
  };
}

function detail(label: string, value: string): WebNode {
  return row('offer-detail-row', [textBlock(label, 'muted'), textBlock(value)]);
}

function timestamp(seconds: number, label: string): WebNode {
  return {
    type: 'element',
    tag: 'timestamp',
    props: { timestampMs: seconds * 1000, label, tone: 'muted' },
  };
}

function statusBadge(status: ReturnType<typeof offerStatus>): WebNode {
  return {
    type: 'element',
    tag: 'badge',
    props: {
      label: status,
      tone:
        status === 'active'
          ? 'success'
          : status === 'upcoming'
            ? 'warning'
            : 'default',
      size: 'sm',
    },
  };
}

function relaySummary(record: OfferRelayRecord | null): string {
  if (!record) {
    return 'no local publication record';
  }

  const accepted = record.targets.filter(
    (url) => !record.failed.includes(url),
  ).length;

  return `${accepted}/${record.targets.length} accepted${record.failed.length ? ` · ${record.failed.length} failed` : ''}`;
}

function relayDetails(record: OfferRelayRecord | null): WebNode[] {
  if (!record) {
    return [
      textBlock(
        'No local acknowledgement record for this older or externally published event.',
        'muted',
      ),
    ];
  }

  return [
    {
      type: 'element',
      tag: 'timestamp',
      props: {
        timestampMs: record.updatedAt,
        label: 'Last attempt: ',
        tone: 'muted',
      },
    },
    ...record.targets.map((url) =>
      row('offer-relay-row', [
        textBlock(
          record.failed.includes(url) ? 'failed' : 'accepted',
          record.failed.includes(url) ? 'warning' : 'success',
        ),
        textBlock(url, 'muted'),
      ]),
    ),
    detail(
      'Known accepting relays across retries',
      record.accepted.join(', ') || 'none',
    ),
  ];
}

function offerField(name: string, value: string): WebNode {
  return {
    type: 'element',
    tag: 'textField',
    props: { formFieldName: name, value },
  };
}

function dateTimeField(name: string, seconds: string): WebNode {
  return {
    type: 'element',
    tag: 'textField',
    props: {
      formFieldName: name,
      inputType: 'datetime-local',
      value: seconds ? new Date(Number(seconds) * 1000).toISOString() : '',
    },
  };
}

function field(label: string, input: WebNode): WebNode {
  return stack('offer-form-field', [textBlock(label, 'muted'), input]);
}

type HistoryRowProps = {
  alias: string;
  offer: PaymentOffer;
  advertised: boolean;
  record: OfferRelayRecord | null;
};

function historyRow({
  alias,
  offer,
  advertised,
  record,
}: HistoryRowProps): WebNode {
  const status = offerStatus(offer);

  const action: WebNode = advertised
    ? textBlock('Advertised', 'muted')
    : status === 'expired'
      ? textBlock('—', 'muted')
      : {
          type: 'element',
          tag: 'button',
          props: {
            label: 'Advertise',
            className: 'web-button',
            action: offerAction({
              alias,
              operation: 'offer-select',
              options: { offer_id: offer.event.id },
            }),
          },
        };

  return stack('offer-history-entry', [
    row('offer-history-grid', [
      eventLink(
        offer.event.id,
        `${Number(offer.price).toLocaleString('en-US')} sats ↗`,
      ),
      stack('offer-history-status', [statusBadge(status)]),
      stack('offer-history-dates', [
        timestamp(offer.validFrom, 'From: '),
        timestamp(offer.validUntil, 'Until: '),
      ]),
      stack('offer-history-action', [action]),
    ]),
    disclosure(`Offer details · ${relaySummary(record)}`, [
      detail('Event', offer.event.id),
      detail('Lightning address', offer.lightningAddress),
      detail('Receipt provider', offer.providerPubkey),
      ...relayDetails(record),
    ]),
  ]);
}

export function renderOfferManagement(
  props: RenderOfferManagementProps,
): WebNodeRoot {
  const {
    alias,
    published,
    offers,
    notice,
    review,
    releasePreview,
    publicationRelays,
    relayRecords,
  } = props;

  const pointer = published.catalogEvent?.tags.find(
    (tag) => tag[0] === 'offer',
  );

  const current = offers.find((offer) => offer.event.id === pointer?.[1]);
  const now = Math.floor(Date.now() / 1000);

  const reviewedValue = (name: string): string | undefined =>
    review?.template.tags.find((tag) => tag[0] === name)?.[1];

  const catalogRecord = relayRecords[published.id] ?? null;

  const children: WebNode[] = [
    stack('offer-header', [
      row('offer-title-row', [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold', className: 'offer-title' },
          children: [textNode(published.title || published.name)],
        },
        textBlock(published.version, 'muted'),
        eventLink(published.id, 'Catalog ↗'),
      ]),
      row('offer-header-meta', [
        link(
          `nostr:${nip19.npubEncode(published.pubkey)}`,
          `Author ${published.pubkey.slice(0, 8)}…${published.pubkey.slice(-6)}`,
        ),
        link(published.repo, 'Repository ↗'),
      ]),
    ]),
    ...(notice
      ? [
          textBlock(
            notice,
            notice === 'Current offer updated.' ? 'success' : 'warning',
          ),
        ]
      : []),
    stack('offer-section offer-current', [
      heading('Current offer'),
      ...(current
        ? [
            row('offer-current-price', [
              {
                type: 'element' as const,
                tag: 'text' as const,
                props: { weight: 'bold' as const, className: 'offer-price' },
                children: [
                  textNode(
                    `${Number(current.price).toLocaleString('en-US')} sats`,
                  ),
                ],
              },
              statusBadge(offerStatus(current)),
              eventLink(current.event.id, 'Offer ↗'),
            ]),
            textBlock('One-time · all future versions', 'muted'),
            row('offer-validity', [
              timestamp(current.validFrom, 'From (inclusive): '),
              timestamp(current.validUntil, 'Until (exclusive): '),
            ]),
          ]
        : [
            textBlock(
              pointer
                ? 'Advertised offer unavailable or unverified.'
                : 'No offer advertised.',
              pointer ? 'warning' : 'muted',
            ),
          ]),
      disclosure('Technical details & publication relays', [
        detail('Author', published.pubkey),
        detail('App coordinate', `32107:${published.pubkey}:${published.name}`),
        detail('Catalog event', published.id),
        detail('Repository', published.repo),
        detail('Publication destinations', publicationRelays.join(', ')),
        ...(pointer?.[2] ? [detail('Advertised relay hint', pointer[2])] : []),
        ...(current
          ? [
              detail('Lightning address', current.lightningAddress),
              detail('Receipt provider', current.providerPubkey),
            ]
          : []),
        disclosure(
          `Catalog publication · ${relaySummary(catalogRecord)}`,
          relayDetails(catalogRecord),
        ),
      ]),
    ]),
    ...(releasePreview
      ? [
          disclosure('Local release · review publication', [
            releasePreview.tree,
          ]),
        ]
      : []),
    stack('offer-section offer-history', [
      row('offer-section-title', [
        heading('Offer history'),
        textBlock(`${offers.length} shown · recent offers`, 'muted'),
      ]),
      ...(offers.length
        ? [
            row(
              'offer-history-grid offer-history-head',
              ['Price', 'Status', 'Validity', 'Action'].map((label) =>
                textBlock(label, 'muted'),
              ),
            ),
            ...offers.map((offer) =>
              historyRow({
                alias,
                offer,
                advertised: current?.event.id === offer.event.id,
                record: relayRecords[offer.event.id] ?? null,
              }),
            ),
          ]
        : [textBlock('No verified offers found.', 'muted')]),
    ]),
  ];

  if (review) {
    children.push(
      stack('offer-section offer-review', [
        row('offer-section-title', [
          heading('Review new offer'),
          textBlock(
            `${Number(reviewedValue('price')).toLocaleString('en-US')} sats`,
            'warning',
          ),
        ]),
        textBlock('One-time · all future versions', 'muted'),
        detail('Lightning address', reviewedValue('lud16') ?? ''),
        row('offer-validity', [
          timestamp(Number(reviewedValue('validFrom')), 'From (inclusive): '),
          timestamp(Number(reviewedValue('validUntil')), 'Until (exclusive): '),
        ]),
        disclosure('Provider & signed event fields', [
          detail('Receipt provider', reviewedValue('nostrPubkey') ?? ''),
          ...review.template.tags.map((tag) =>
            detail(tag[0], tag.slice(1).join(' · ')),
          ),
        ]),
        textBlock(
          'Publishes an immutable offer and updates the catalog. Earlier offers keep their validity windows.',
          'muted',
        ),
        row('offer-actions', [
          {
            type: 'element',
            tag: 'button',
            props: {
              label: 'Publish offer & update catalog',
              className: 'web-button',
              tone: 'warning',
              action: offerAction({
                alias,
                operation: 'offer-publish',
                options: { draft: review.id },
              }),
            },
          },
        ]),
      ]),
    );
  }

  children.push({
    type: 'element',
    tag: 'form',
    props: {
      className: 'offer-section plugin-offer-form',
      formOptionFieldNames: [
        'price',
        'lightning_address',
        'valid_from',
        'valid_until',
      ],
      action: offerAction({ alias, operation: 'offer-review', options: {} }),
    },
    children: [
      row('offer-section-title', [
        heading('New offer'),
        textBlock('One-time · all future versions', 'muted'),
      ]),
      stack('offer-form-grid', [
        field(
          'Price (exact sats)',
          offerField('price', reviewedValue('price') ?? current?.price ?? ''),
        ),
        field(
          'Lightning address',
          offerField(
            'lightning_address',
            reviewedValue('lud16') ?? current?.lightningAddress ?? '',
          ),
        ),
        field(
          'Valid from · inclusive',
          dateTimeField(
            'valid_from',
            reviewedValue('validFrom') ?? String(now),
          ),
        ),
        field(
          'Valid until · exclusive',
          dateTimeField('valid_until', reviewedValue('validUntil') ?? ''),
        ),
      ]),
      textBlock(
        'Dates use your browser’s timezone. An expired advertised offer allows free installation.',
        'muted',
      ),
      row('offer-actions', [
        {
          type: 'element',
          tag: 'button',
          props: {
            label: 'Review offer',
            className: 'web-button',
            tone: 'warning',
            htmlType: 'submit',
          },
        },
      ]),
    ],
  });

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'publish' },
    tree: stack('plugin-offer-management', children),
    stylesheets: [
      ...(releasePreview?.stylesheets ?? []),
      {
        id: 'plugin-offer-management',
        cssText: `
        .plugin-offer-management { gap: .8rem; min-width: 0; }
        .plugin-offer-management .offer-header { gap: .25rem; }
        .plugin-offer-management .offer-title-row,
        .plugin-offer-management .offer-header-meta,
        .plugin-offer-management .offer-current-price,
        .plugin-offer-management .offer-section-title,
        .plugin-offer-management .offer-validity,
        .plugin-offer-management .offer-actions { align-items: center; gap: .6rem; }
        .plugin-offer-management .offer-title { margin-right: auto; }
        .plugin-offer-management .offer-price { font-size: 1.2em; }
        .plugin-offer-management .offer-section { display: grid; gap: .45rem; min-width: 0; border-top: 1px solid var(--color-border); padding-top: .65rem; }
        .plugin-offer-management .offer-section-heading { text-transform: uppercase; font-size: .85em; letter-spacing: .04em; }
        .plugin-offer-management .offer-history-grid { display: grid; grid-template-columns: minmax(7rem, .8fr) minmax(5rem, .65fr) minmax(0, 2fr) minmax(6rem, .8fr); align-items: center; gap: .5rem; }
        .plugin-offer-management .offer-history-head { font-size: .85em; }
        .plugin-offer-management .offer-history-entry { gap: .2rem; padding: .45rem 0; border-top: 1px solid var(--color-border); }
        .plugin-offer-management .offer-history-dates { gap: .15rem; font-size: .9em; }
        .plugin-offer-management .offer-details { min-width: 0; font-size: .9em; }
        .plugin-offer-management .offer-details > summary { cursor: pointer; color: var(--color-text-muted); padding: .15rem 0; }
        .plugin-offer-management .offer-details > summary:focus-visible { outline: 1px solid var(--color-warning); outline-offset: 2px; }
        .plugin-offer-management .offer-details-body { gap: .3rem; padding: .4rem 0 .2rem .8rem; overflow-wrap: anywhere; }
        .plugin-offer-management .offer-detail-row { display: grid; grid-template-columns: minmax(7rem, 10rem) minmax(0, 1fr); gap: .5rem; }
        .plugin-offer-management .offer-relay-row { display: grid; grid-template-columns: 5rem minmax(0, 1fr); gap: .5rem; }
        .plugin-offer-management .offer-form-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .55rem .8rem; }
        .plugin-offer-management .offer-form-field { gap: .2rem; min-width: 0; }
        .plugin-offer-management .offer-form-field .web-textField { min-width: 0; }
        .plugin-offer-management .offer-form-field input { box-sizing: border-box; width: 100%; min-width: 0; }
        @media (max-width: 600px) {
          .plugin-offer-management .offer-form-grid { grid-template-columns: minmax(0, 1fr); }
          .plugin-offer-management .offer-history-head { display: none; }
          .plugin-offer-management .offer-history-grid { grid-template-columns: minmax(0, 1fr) auto; }
          .plugin-offer-management .offer-history-dates { grid-column: 1 / -1; grid-row: 2; }
          .plugin-offer-management .offer-history-action { grid-column: 1 / -1; }
          .plugin-offer-management .offer-detail-row { grid-template-columns: minmax(0, 1fr); gap: .1rem; }
        }
      `,
      },
    ],
  };
}
