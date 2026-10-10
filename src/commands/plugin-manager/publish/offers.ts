import { randomUUID } from 'node:crypto';

import { verifyEvent, type EventTemplate, type NostrEvent } from 'nostr-tools';

import type { RouteCommandContext } from '@src/commands/dispatch';
import { getState, setState } from '@src/db';
import { bunkerSignEvent } from '@src/nostr/bunker';
import type { ConnectionRow } from '@src/nostr/connections';
import { uniqueRelays } from '@src/nostr/nip65';
import type { WebNodeRoot } from '@src/web/ui-schema';

import type { PluginCatalogEntry } from '../install/handler';
import {
  createPaymentOfferTemplate,
  offerStatus,
  offerTimestamp,
  parsePaymentOffer,
  PAYMENT_OFFER_KIND,
  positiveInteger,
  resolveOfferProvider,
  type PaymentOffer,
} from '../payment-offers';

import { renderOfferManagement } from './renderers/offers';

type OfferDraft = {
  app: string;
  template: EventTemplate;
  signed: NostrEvent | null;
};

export type OfferRelayRecord = {
  targets: string[];
  accepted: string[];
  failed: string[];
  updatedAt: number;
};

function relayRecordKey(id: string): string {
  return `plugins.publication-relays.${id}`;
}

function readRelayRecord(
  ctx: RouteCommandContext,
  id: string,
): OfferRelayRecord | null {
  const stored = getState(ctx.seenDb, relayRecordKey(id));

  if (!stored) {
    return null;
  }

  try {
    const record = JSON.parse(stored) as OfferRelayRecord;

    if (
      ![record.targets, record.accepted, record.failed].every(
        (urls) =>
          Array.isArray(urls) && urls.every((url) => typeof url === 'string'),
      )
    ) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

function offerDateTime(value: string): number {
  // Keep existing numeric command payloads compatible with earlier forms.
  if (/^\d+$/.test(value)) {
    return offerTimestamp(value);
  }

  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    throw new Error('Select a date and time with a timezone.');
  }

  return offerTimestamp(String(Math.floor(Date.parse(value) / 1000)));
}

export type OfferManagementProps = {
  ctx: RouteCommandContext;
  alias: string;
  published: PluginCatalogEntry;
  connection: ConnectionRow;
  relays: string[];
  releasePreview: WebNodeRoot | null;
};

const activePublications = new Set<string>();

export function publicationOptions(
  ctx: RouteCommandContext,
): Record<string, unknown> {
  if (!ctx.jsonPayload || typeof ctx.jsonPayload !== 'object') {
    return {};
  }

  const options = (ctx.jsonPayload as { options?: unknown }).options;

  return options && typeof options === 'object'
    ? (options as Record<string, unknown>)
    : {};
}

export function publicationOperation(ctx: RouteCommandContext): string {
  const value = publicationOptions(ctx).operation;

  return typeof value === 'string' ? value : '';
}

function field(options: Record<string, unknown>, name: string): string {
  return typeof options[name] === 'string' ? options[name].trim() : '';
}

function draftKey(id: string): string {
  return `plugins.offer-draft.${id}`;
}

type PublishSignedProps = {
  ctx: RouteCommandContext;
  connection: ConnectionRow;
  relays: string[];
  event: NostrEvent;
};

async function publishSigned(params: PublishSignedProps): Promise<string[]> {
  const results = await Promise.allSettled(
    params.ctx.pool.publish(params.relays, params.event, {
      onauth: (event) =>
        bunkerSignEvent(params.ctx.pool, params.connection.data, event),
    }),
  );

  const accepted = params.relays.filter(
    (_, index) => results[index].status === 'fulfilled',
  );

  const previous = readRelayRecord(params.ctx, params.event.id);

  setState(
    params.ctx.seenDb,
    relayRecordKey(params.event.id),
    JSON.stringify({
      targets: params.relays,
      accepted: uniqueRelays([...(previous?.accepted ?? []), ...accepted]),
      failed: params.relays.filter(
        (_, index) => results[index].status === 'rejected',
      ),
      updatedAt: Date.now(),
    } satisfies OfferRelayRecord),
  );

  if (accepted.length === 0) {
    throw new Error(
      'No relay accepted the event. Retry the same reviewed offer.',
    );
  }

  return accepted;
}

export async function managePaymentOffers(
  props: OfferManagementProps,
): Promise<WebNodeRoot> {
  const { ctx, alias, published, connection, relays, releasePreview } = props;
  const app = `32107:${published.pubkey}:${published.name}`;
  const options = publicationOptions(ctx);
  const operation = publicationOperation(ctx);

  const pointer = published.catalogEvent?.tags.find(
    (tag) => tag[0] === 'offer',
  );

  const queryRelays = uniqueRelays([
    ...relays,
    ...(pointer?.[2] ? [pointer[2]] : []),
  ]);

  const events = await ctx.pool.querySync(
    queryRelays,
    {
      kinds: [PAYMENT_OFFER_KIND],
      authors: [published.pubkey],
      '#a': [app],
      limit: 100,
    },
    { maxWait: 5_000 },
  );

  if (pointer?.[1] && !events.some((event) => event.id === pointer[1])) {
    events.push(
      ...(await ctx.pool.querySync(
        queryRelays,
        { ids: [pointer[1]], kinds: [PAYMENT_OFFER_KIND] },
        { maxWait: 5_000 },
      )),
    );
  }

  const offers = [...new Map(events.map((event) => [event.id, event])).values()]
    .map((event) => parsePaymentOffer(event, app))
    .filter((offer): offer is PaymentOffer => offer !== null)
    .sort((a, b) => b.event.created_at - a.event.created_at);

  let notice: string | null = null;
  let review: { id: string; template: EventTemplate } | null = null;
  const requestedDraft = field(options, 'draft');

  try {
    if (operation === 'offer-review') {
      const price = field(options, 'price');
      positiveInteger(price);
      const validFrom = offerDateTime(field(options, 'valid_from'));
      const validUntil = offerDateTime(field(options, 'valid_until'));

      if (
        validUntil <= validFrom ||
        validUntil <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error(
          'Valid until must be in the future and later than valid from.',
        );
      }

      const lightningAddress = field(options, 'lightning_address');

      const providerPubkey = await resolveOfferProvider(
        lightningAddress,
        price,
      );

      const template = createPaymentOfferTemplate({
        app,
        price,
        lightningAddress,
        providerPubkey,
        validFrom,
        validUntil,
      });

      const id = randomUUID();

      setState(
        ctx.seenDb,
        draftKey(id),
        JSON.stringify({ app, template, signed: null } satisfies OfferDraft),
      );

      review = { id, template };
    }

    if (operation === 'offer-publish' || operation === 'offer-select') {
      if (activePublications.has(app)) {
        throw new Error(
          'An offer publication is already in progress for this app.',
        );
      }

      activePublications.add(app);
      try {
        let offer: PaymentOffer;
        let accepted = queryRelays;

        if (operation === 'offer-publish') {
          const stored = getState(ctx.seenDb, draftKey(requestedDraft));

          if (!stored) {
            throw new Error('Review the offer before publishing.');
          }

          const draft = JSON.parse(stored) as OfferDraft;

          if (draft.app !== app) {
            throw new Error('This reviewed offer belongs to another app.');
          }

          review = { id: requestedDraft, template: draft.template };

          const address =
            draft.template.tags.find((tag) => tag[0] === 'lud16')?.[1] ?? '';

          const provider = await resolveOfferProvider(
            address,
            draft.template.tags.find((tag) => tag[0] === 'price')?.[1] ?? '',
          );

          if (
            provider !==
            draft.template.tags.find((tag) => tag[0] === 'nostrPubkey')?.[1]
          ) {
            throw new Error('Provider key changed. Review a new offer.');
          }

          if (!draft.signed) {
            draft.signed = await bunkerSignEvent(
              ctx.pool,
              connection.data,
              draft.template,
            );

            setState(
              ctx.seenDb,
              draftKey(requestedDraft),
              JSON.stringify(draft),
            );
          }

          const parsed = parsePaymentOffer(draft.signed, app);

          if (!parsed || offerStatus(parsed) === 'expired') {
            throw new Error(
              'Reviewed offer is invalid or expired. Review a new offer.',
            );
          }

          offer = parsed;

          if (!offers.some((item) => item.event.id === offer.event.id)) {
            offers.unshift(offer);
          }

          accepted = await publishSigned({
            ctx,
            connection,
            relays: queryRelays,
            event: draft.signed,
          });

          notice = `Offer ${offer.event.id} published. Updating the catalog pointer…`;
        } else {
          const selected = offers.find(
            (item) => item.event.id === field(options, 'offer_id'),
          );

          if (!selected || offerStatus(selected) === 'expired') {
            throw new Error('Choose an existing unexpired author offer.');
          }

          const provider = await resolveOfferProvider(
            selected.lightningAddress,
            selected.price,
          );

          if (provider !== selected.providerPubkey) {
            throw new Error('Provider key changed. Publish a new offer.');
          }

          offer = selected;

          accepted = await publishSigned({
            ctx,
            connection,
            relays: queryRelays,
            event: offer.event,
          });
        }

        // Re-read the catalog before replacing only its offer pointer.
        const catalogs = await ctx.pool.querySync(
          queryRelays,
          {
            kinds: [32107],
            authors: [published.pubkey],
            '#d': [published.name],
          },
          { maxWait: 5_000 },
        );

        const catalog = [
          ...catalogs,
          ...(published.catalogEvent ? [published.catalogEvent] : []),
        ]
          .filter(
            (event) =>
              verifyEvent(event) &&
              event.pubkey === published.pubkey &&
              event.kind === 32107 &&
              event.tags.some(
                (tag) => tag[0] === 'd' && tag[1] === published.name,
              ),
          )
          .sort(
            (a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id),
          )[0];

        if (!catalog) {
          throw new Error(
            'Published catalog unavailable; retry this offer to update its pointer.',
          );
        }

        const template: EventTemplate = {
          kind: 32107,
          content: catalog.content,
          created_at: Math.max(
            Math.floor(Date.now() / 1000),
            catalog.created_at + 1,
          ),
          tags: [
            ...catalog.tags.filter((tag) => tag[0] !== 'offer'),
            ['offer', offer.event.id, accepted[0]],
          ],
        };

        const signed = await bunkerSignEvent(
          ctx.pool,
          connection.data,
          template,
        );

        await publishSigned({
          ctx,
          connection,
          relays: queryRelays,
          event: signed,
        });

        published.catalogEvent = signed;
        published.id = signed.id;

        if (!offers.some((item) => item.event.id === offer.event.id)) {
          offers.unshift(offer);
        }

        notice = 'Current offer updated.';
        review = null;
      } finally {
        activePublications.delete(app);
      }
    }
  } catch (error) {
    notice = `${notice ? `${notice} ` : ''}${error instanceof Error ? error.message : String(error)}`;
  }

  return renderOfferManagement({
    alias,
    published,
    offers,
    notice,
    review,
    releasePreview,
    publicationRelays: queryRelays,
    relayRecords: Object.fromEntries(
      [published.id, ...offers.map((offer) => offer.event.id)].map((id) => [
        id,
        readRelayRecord(ctx, id),
      ]),
    ),
  });
}
