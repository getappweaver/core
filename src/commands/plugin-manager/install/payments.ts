import { randomUUID } from 'node:crypto';

import { verifyEvent, type EventTemplate, type NostrEvent } from 'nostr-tools';

import type { RouteCommandContext } from '@src/commands/dispatch';
import { getState, setState } from '@src/db';
import { bunkerSignEvent } from '@src/nostr/bunker';
import { listConnections } from '@src/nostr/connections';
import { fetchNip65RelaySet, uniqueRelays } from '@src/nostr/nip65';
import { Satoshi } from '@src/payments/amount';
import { parseLightningInvoice } from '@src/payments/lightning-invoice';
import { createUnsupportedInteractivePaymentService } from '@src/payments/service';
import {
  createZapInvoice,
  invoiceMatchesZapRequest,
  singletonZapTag,
  validateZapReceipt,
} from '@src/payments/zap';
import type { WebNodeRoot } from '@src/web/ui-schema';

import {
  offerStatus,
  parsePaymentOffer,
  type PaymentOffer,
} from '../payment-offers';

import { PLUGIN_QUERY_RELAYS, type PluginCatalogEntry } from './handler';
import {
  renderFreeVersionNotice,
  renderPurchaseCheckout,
  renderPurchaseInfo,
} from './renderers/payments';
import { authorizePurchaseRestoration } from './restoration';

export type PluginPaymentState = {
  status: 'free' | 'active' | 'upcoming' | 'expired' | 'unavailable';
  offer: PaymentOffer | null;
  purchased: boolean;
};

export type PurchaseIdentity = { id: string; label: string; pubkey: string };
type PurchaseProof = {
  offer: NostrEvent;
  receipt: NostrEvent;
  relays: string[];
};
type PurchaseAttempt = {
  id: string;
  app: string;
  buyer: string;
  offer: NostrEvent;
  template: EventTemplate;
  request: NostrEvent | null;
  invoice: string | null;
  relays: string[];
};

export function purchaseOptions(
  ctx: RouteCommandContext,
): Record<string, unknown> {
  const fallback: Record<string, unknown> = {};
  for (const name of ['operation', 'identity', 'attempt', 'challenge']) {
    const index = ctx.args.indexOf(`--${name}`);

    if (index >= 0) {
      fallback[name] = ctx.args[index + 1] ?? '';
    }
  }

  if (!ctx.jsonPayload || typeof ctx.jsonPayload !== 'object') {
    return fallback;
  }

  const options = (ctx.jsonPayload as { options?: unknown }).options;

  return options && typeof options === 'object'
    ? (options as Record<string, unknown>)
    : fallback;
}

function option(options: Record<string, unknown>, name: string): string {
  return typeof options[name] === 'string' ? options[name].trim() : '';
}

export function appCoordinate(entry: PluginCatalogEntry): string {
  return `32107:${entry.pubkey}:${entry.name}`;
}

function proofKey(app: string, buyer: string): string {
  return `plugins.purchase.${app}:${buyer}`;
}

function pendingKey(app: string, buyer: string): string {
  return `plugins.purchase-pending.${app}:${buyer}`;
}

function attemptKey(id: string): string {
  return `plugins.purchase-attempt.${id}`;
}

function offerKey(id: string): string {
  return `plugins.payment-offer.${id}`;
}

function validProof(proof: PurchaseProof, app: string, buyer: string): boolean {
  const offer = parsePaymentOffer(proof.offer, app);

  return (
    !!offer &&
    validateZapReceipt({
      receipt: proof.receipt,
      buyer,
      recipient: offer.recipient,
      provider: offer.providerPubkey,
      app,
      offerId: offer.event.id,
      price: offer.price,
      validFrom: offer.validFrom,
      validUntil: offer.validUntil,
    })
  );
}

function cachedProof(
  ctx: RouteCommandContext,
  app: string,
  buyer: string,
): PurchaseProof | null {
  try {
    const raw = getState(ctx.seenDb, proofKey(app, buyer));

    if (!raw) {
      return null;
    }

    const proof = JSON.parse(raw) as PurchaseProof;

    return validProof(proof, app, buyer) ? proof : null;
  } catch {
    return null;
  }
}

async function loadOffer(props: {
  ctx: RouteCommandContext;
  id: string;
  app: string;
  relays: string[];
}): Promise<PaymentOffer | null> {
  if (!/^[0-9a-f]{64}$/.test(props.id)) {
    return null;
  }

  const cached = getState(props.ctx.seenDb, offerKey(props.id));

  if (cached) {
    try {
      const offer = parsePaymentOffer(
        JSON.parse(cached) as NostrEvent,
        props.app,
      );

      if (offer?.event.id === props.id) {
        return offer;
      }
    } catch {
      /* Fetch again if the local cache is malformed. */
    }
  }

  const events = await props.ctx.pool.querySync(
    props.relays,
    { ids: [props.id], kinds: [8107] },
    { maxWait: 5_000 },
  );

  const offer =
    events
      .map((event) => parsePaymentOffer(event, props.app))
      .find((item) => item?.event.id === props.id) ?? null;

  if (offer) {
    setState(props.ctx.seenDb, offerKey(props.id), JSON.stringify(offer.event));
  }

  return offer;
}

function offerRelays(
  ctx: RouteCommandContext,
  entry: PluginCatalogEntry,
): string[] {
  const hint = entry.catalogEvent?.tags.find((tag) => tag[0] === 'offer')?.[2];

  return uniqueRelays([
    ...(hint ? [hint] : []),
    ...PLUGIN_QUERY_RELAYS,
    ...ctx.botRelayUrls,
  ]).slice(0, 12);
}

export async function resolvePluginPayment(
  ctx: RouteCommandContext,
  entry: PluginCatalogEntry,
): Promise<PluginPaymentState> {
  const app = appCoordinate(entry);
  const purchased = !!cachedProof(ctx, app, ctx.config.masterPubkey);

  const pointers =
    entry.catalogEvent?.tags.filter((tag) => tag[0] === 'offer') ?? [];

  if (!pointers.length) {
    return { status: 'free', offer: null, purchased };
  }

  if (pointers.length !== 1) {
    return { status: 'unavailable', offer: null, purchased };
  }

  const offer = await loadOffer({
    ctx,
    id: pointers[0][1] ?? '',
    app,
    relays: offerRelays(ctx, entry),
  });

  return {
    status: offer ? offerStatus(offer) : 'unavailable',
    offer,
    purchased,
  };
}

export async function attachPluginPayments(
  ctx: RouteCommandContext,
  entries: PluginCatalogEntry[],
): Promise<PluginCatalogEntry[]> {
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      payment: await resolvePluginPayment(ctx, entry),
    })),
  );
}

function identities(ctx: RouteCommandContext): PurchaseIdentity[] {
  return [
    ...(ctx.config.masterPubkey
      ? [
          {
            id: 'authenticated',
            label: `Authenticated user · ${ctx.config.masterPubkey.slice(0, 12)}…`,
            pubkey: ctx.config.masterPubkey,
          },
        ]
      : []),
    ...listConnections(ctx.seenDb).map((connection) => ({
      id: `bunker:${connection.name}`,
      label: `Bunker ${connection.name} · ${connection.data.userPubkey.slice(0, 12)}…`,
      pubkey: connection.data.userPubkey,
    })),
  ];
}

async function buyerRelays(
  ctx: RouteCommandContext,
  identity: PurchaseIdentity,
): Promise<string[]> {
  const set = await fetchNip65RelaySet({
    pool: ctx.pool,
    authorPubkey: identity.pubkey,
    fallbackRelays: PLUGIN_QUERY_RELAYS,
  });

  return uniqueRelays([
    ...set.readRelays.slice(0, 6),
    ...PLUGIN_QUERY_RELAYS,
  ]).slice(0, 10);
}

type FindPurchaseProps = {
  ctx: RouteCommandContext;
  entry: PluginCatalogEntry;
  buyer: string;
  relays: string[];
  invoice: string | null;
};

async function findPurchase({
  ctx,
  entry,
  buyer,
  relays,
  invoice,
}: FindPurchaseProps): Promise<PurchaseProof | null> {
  const app = appCoordinate(entry);
  const local = cachedProof(ctx, app, buyer);

  if (
    local &&
    (invoice === null ||
      singletonZapTag(local.receipt, 'bolt11').toLowerCase() ===
        invoice.toLowerCase())
  ) {
    return local;
  }

  let until: number | undefined;
  for (let page = 0; page < 10; page++) {
    const receipts = await ctx.pool.querySync(
      relays,
      {
        kinds: [9735],
        '#a': [app],
        '#p': [entry.pubkey],
        limit: 500,
        ...(until === undefined ? {} : { until }),
      },
      { maxWait: 5_000 },
    );

    for (const receipt of receipts) {
      if (
        invoice !== null &&
        singletonZapTag(receipt, 'bolt11').toLowerCase() !==
          invoice.toLowerCase()
      ) {
        continue;
      }

      try {
        const request = JSON.parse(
          singletonZapTag(receipt, 'description'),
        ) as NostrEvent;

        if (
          request.pubkey !== buyer ||
          request.kind !== 9734 ||
          !verifyEvent(request)
        ) {
          continue;
        }

        const offerHint = request.tags.find((tag) => tag[0] === 'e')?.[2];

        const offer = await loadOffer({
          ctx,
          id: singletonZapTag(request, 'e'),
          app,
          relays: uniqueRelays([...(offerHint ? [offerHint] : []), ...relays]),
        });

        if (!offer) {
          continue;
        }

        const proof: PurchaseProof = { offer: offer.event, receipt, relays };

        if (!validProof(proof, app, buyer)) {
          continue;
        }

        setState(ctx.seenDb, proofKey(app, buyer), JSON.stringify(proof));

        return proof;
      } catch {
        /* Ignore invalid receipts, not other buyers' identities. */
      }
    }

    if (receipts.length < 500) {
      return null;
    }

    const oldest = Math.min(...receipts.map((receipt) => receipt.created_at));

    if (
      receipts.filter((receipt) => receipt.created_at === oldest).length >= 500
    ) {
      break;
    }

    until = oldest; // Include the boundary second so same-timestamp receipts are not skipped.
  }

  throw new Error(
    'Purchase lookup is incomplete. Narrow relay recovery or retry before paying again.',
  );
}

function saveAttempt(ctx: RouteCommandContext, attempt: PurchaseAttempt): void {
  setState(ctx.seenDb, attemptKey(attempt.id), JSON.stringify(attempt));
  setState(ctx.seenDb, pendingKey(attempt.app, attempt.buyer), attempt.id);
}

type GatePluginPaymentProps = {
  ctx: RouteCommandContext;
  entry: PluginCatalogEntry;
};
const activePayments = new Set<string>();

export async function gatePluginPayment({
  ctx,
  entry,
}: GatePluginPaymentProps): Promise<WebNodeRoot | string | null> {
  const payment = await resolvePluginPayment(ctx, entry);
  entry.payment = payment;
  const options = purchaseOptions(ctx);
  const operation = option(options, 'operation');

  if (operation === 'info') {
    return renderPurchaseInfo(entry);
  }

  if (
    payment.status === 'free' ||
    payment.status === 'expired' ||
    payment.status === 'upcoming'
  ) {
    if (
      ctx.source === 'web' &&
      !payment.purchased &&
      operation !== 'free-confirm'
    ) {
      return renderFreeVersionNotice(entry);
    }

    return null;
  }

  const availableIdentities = identities(ctx);

  const identity = availableIdentities.find(
    (item) =>
      item.id ===
      (option(options, 'identity') ||
        (payment.purchased ? 'authenticated' : '')),
  );

  if (ctx.source !== 'web') {
    if (identity) {
      const relays = uniqueRelays([
        ...(await buyerRelays(ctx, identity)),
        ...offerRelays(ctx, entry),
      ]);

      const proof = await findPurchase({
        ctx,
        entry,
        buyer: identity.pubkey,
        relays,
        invoice: null,
      });

      if (proof) {
        return authorizePurchaseRestoration({
          ctx,
          entry,
          identity,
          receipt: proof.receipt,
          challengeId: option(options, 'challenge'),
        });
      }
    }

    return `${entry.title || entry.name}: ${payment.offer?.price ?? 'unknown'} sats required. Open /plugins install in the web UI to choose a purchase identity, restore a purchase, or pay. Your installed version remains usable.`;
  }

  let notice: string | null = null;
  let attempt: PurchaseAttempt | null = null;
  try {
    if (identity) {
      const pendingId =
        option(options, 'attempt') ||
        getState(ctx.seenDb, pendingKey(appCoordinate(entry), identity.pubkey));

      const stored = pendingId
        ? getState(ctx.seenDb, attemptKey(pendingId))
        : null;

      if (stored) {
        attempt = JSON.parse(stored) as PurchaseAttempt;

        if (
          attempt.app !== appCoordinate(entry) ||
          attempt.buyer !== identity.pubkey
        ) {
          throw new Error(
            'Payment attempt belongs to a different app or identity.',
          );
        }
      }

      const relays = uniqueRelays([
        ...(await buyerRelays(ctx, identity)),
        ...offerRelays(ctx, entry),
        ...(attempt?.relays ?? []),
      ]).slice(0, 24);

      const proof = await findPurchase({
        ctx,
        entry,
        buyer: identity.pubkey,
        relays,
        invoice: null,
      });

      if (proof) {
        return await authorizePurchaseRestoration({
          ctx,
          entry,
          identity,
          receipt: proof.receipt,
          challengeId: option(options, 'challenge'),
        });
      }

      if (operation === 'check' && attempt?.invoice) {
        notice =
          'Receipt not found yet. Check again or pay the existing invoice; do not pay twice if your wallet already paid.';
      }

      if (!attempt || operation === 'new-payment') {
        if (!payment.offer || payment.status !== 'active') {
          throw new Error(
            'The advertised offer is unavailable. Restore a previous purchase or ask the author to fix the offer.',
          );
        }

        const attemptId = randomUUID();

        const template: EventTemplate = {
          kind: 9734,
          created_at: Math.floor(Date.now() / 1000),
          content: '',
          tags: [
            ['a', appCoordinate(entry)],
            [
              'e',
              payment.offer.event.id,
              entry.catalogEvent?.tags.find((tag) => tag[0] === 'offer')?.[2] ??
                '',
            ],
            ['k', '8107'],
            ['p', payment.offer.recipient],
            [
              'amount',
              Satoshi.parse(payment.offer.price).toMillisatoshi().toString(),
            ],
            ['relays', ...relays],
            ['nonce', attemptId],
          ],
        };

        attempt = {
          id: attemptId,
          app: appCoordinate(entry),
          buyer: identity.pubkey,
          offer: payment.offer.event,
          template,
          request: null,
          invoice: null,
          relays,
        };

        saveAttempt(ctx, attempt);
      }

      if (operation === 'pay') {
        const scope = `${attempt.app}:${attempt.buyer}`;

        if (activePayments.has(scope)) {
          throw new Error(
            'A payment for this app and identity is already in progress.',
          );
        }

        activePayments.add(scope);
        try {
          let signedThisRun = false;
          const offer = parsePaymentOffer(attempt.offer, attempt.app);

          if (!offer || offerStatus(offer) !== 'active') {
            throw new Error(
              'This payment offer is no longer active. Reopen installation to check the current price.',
            );
          }

          if (!attempt.request) {
            if (identity.id === 'authenticated') {
              const args =
                ctx.jsonPayload && typeof ctx.jsonPayload === 'object'
                  ? (ctx.jsonPayload as { arguments?: Record<string, unknown> })
                      .arguments
                  : null;

              if (typeof args?.signedEvent !== 'string') {
                throw new Error(
                  'Approve the zap request with your authenticated signer.',
                );
              }

              attempt.request = JSON.parse(args.signedEvent) as NostrEvent;
            } else {
              const connection = listConnections(ctx.seenDb).find(
                (item) => `bunker:${item.name}` === identity.id,
              );

              if (!connection) {
                throw new Error(
                  'Reconnect the purchase identity in the bunker manager.',
                );
              }

              attempt.request = await bunkerSignEvent(
                ctx.pool,
                connection.data,
                {
                  ...attempt.template,
                  created_at: Math.floor(Date.now() / 1000),
                },
              );
            }

            if (
              !verifyEvent(attempt.request) ||
              attempt.request.kind !== 9734 ||
              attempt.request.pubkey !== identity.pubkey ||
              attempt.request.content !== attempt.template.content ||
              JSON.stringify(attempt.request.tags) !==
                JSON.stringify(attempt.template.tags)
            ) {
              attempt.request = null;
              throw new Error(
                'Signed zap request does not match the selected purchase.',
              );
            }

            saveAttempt(ctx, attempt);

            signedThisRun =
              singletonZapTag(attempt.request, 'nonce') === attempt.id;
          }

          if (
            !verifyEvent(attempt.request) ||
            attempt.request.pubkey !== identity.pubkey ||
            attempt.request.kind !== 9734 ||
            singletonZapTag(attempt.request, 'a') !== attempt.app ||
            singletonZapTag(attempt.request, 'e') !== offer.event.id ||
            singletonZapTag(attempt.request, 'p') !== offer.recipient ||
            singletonZapTag(attempt.request, 'amount') !==
              Satoshi.parse(offer.price).toMillisatoshi().toString()
          ) {
            throw new Error(
              'Saved zap request does not match this offer and buyer.',
            );
          }

          if (!attempt.invoice) {
            attempt.invoice = await createZapInvoice({
              lightningAddress: offer.lightningAddress,
              provider: offer.providerPubkey,
              price: offer.price,
              request: attempt.request,
            });

            saveAttempt(ctx, attempt);
          }

          if (!invoiceMatchesZapRequest(attempt.invoice, attempt.request)) {
            throw new Error(
              'Saved invoice does not match the signed purchase request.',
            );
          }

          if (
            parseLightningInvoice(attempt.invoice).expiresAt <=
            Math.floor(Date.now() / 1000)
          ) {
            throw new Error(
              'Invoice expired. Check receipts again before explicitly starting a new payment.',
            );
          }

          const currentAttempt = attempt;

          const payments =
            ctx.interactivePaymentServiceFactory?.({
              pluginName: 'appweaver-core',
              pluginAlias: 'plugins',
              title: 'App purchase',
              iconUrl: null,
            }) ?? createUnsupportedInteractivePaymentService();

          const result = await payments.requestPayment({
            purpose: `Buy ${entry.title || entry.name} · one-time, all future versions`,
            recipient: offer.lightningAddress,
            options: [
              {
                type: 'lightning',
                amount: Satoshi.parse(offer.price),
                freshlyCreated: true,
                refreshable: false,
                createInvoice: async () => ({
                  invoice: currentAttempt.invoice!,
                  checkSettlement: async () => {
                    const proof = await findPurchase({
                      ctx,
                      entry,
                      buyer: identity.pubkey,
                      relays: currentAttempt.relays,
                      invoice: currentAttempt.invoice,
                    });

                    return proof
                      ? { status: 'settled' }
                      : { status: 'pending' };
                  },
                }),
              },
            ],
          });

          const settledProof = cachedProof(ctx, attempt.app, identity.pubkey);

          if (settledProof && result.status === 'success') {
            if (signedThisRun) {
              return null;
            }

            return await authorizePurchaseRestoration({
              ctx,
              entry,
              identity,
              receipt: settledProof.receipt,
              challengeId: '',
            });
          }

          notice =
            result.status === 'rejected'
              ? 'Payment cancelled. Any existing payment can still be recovered with Check receipt.'
              : result.status === 'unsupported'
                ? result.reasons.map((reason) => reason.message).join(' ')
                : result.status === 'failed'
                  ? `${result.error.message} Check the receipt before paying again.`
                  : 'Payment submitted; waiting for a valid receipt.';
        } finally {
          activePayments.delete(scope);
        }
      } else if (!notice) {
        notice =
          'No matching purchase receipt found on the queried relays. Choose another identity or review the purchase below.';
      }
    }
  } catch (error) {
    notice = error instanceof Error ? error.message : String(error);
  }

  // Expiry during checkout must not turn an expired advertised offer into a gate.
  if (payment.offer && offerStatus(payment.offer) === 'expired') {
    return null;
  }

  return renderPurchaseCheckout({
    entry,
    identities: availableIdentities,
    identity: identity ?? null,
    attempt,
    notice,
  });
}

export type { PurchaseAttempt };
