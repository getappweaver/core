import { verifyEvent, type EventTemplate, type NostrEvent } from 'nostr-tools';

export const PAYMENT_OFFER_KIND = 8107;
const HEX_KEY = /^[0-9a-f]{64}$/;

export type PaymentOffer = {
  event: NostrEvent;
  app: string;
  price: string;
  recipient: string;
  lightningAddress: string;
  providerPubkey: string;
  validFrom: number;
  validUntil: number;
};

export function offerTag(event: NostrEvent, name: string): string {
  const values = event.tags.filter((tag) => tag[0] === name);

  return values.length === 1 ? (values[0][1] ?? '') : '';
}

export function positiveInteger(value: string): number {
  const number = Number(value);

  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(number)) {
    throw new Error('Expected a positive integer.');
  }

  return number;
}

export function offerTimestamp(value: string): number {
  const timestamp = positiveInteger(value);

  if (!Number.isFinite(new Date(timestamp * 1000).getTime())) {
    throw new Error('Timestamp is outside the supported date range.');
  }

  return timestamp;
}

export function parsePaymentOffer(
  event: NostrEvent,
  app: string,
): PaymentOffer | null {
  try {
    const author = app.split(':')[1];
    const price = offerTag(event, 'price');
    const validFrom = offerTimestamp(offerTag(event, 'validFrom'));
    const validUntil = offerTimestamp(offerTag(event, 'validUntil'));
    const providerPubkey = offerTag(event, 'nostrPubkey');
    positiveInteger(price);

    if (
      event.kind !== PAYMENT_OFFER_KIND ||
      !verifyEvent(event) ||
      event.pubkey !== author ||
      offerTag(event, 'a') !== app ||
      offerTag(event, 'p') !== author ||
      offerTag(event, 'type') !== 'one-time' ||
      event.tags.find((tag) => tag[0] === 'price')?.[2] !== 'sat' ||
      !HEX_KEY.test(providerPubkey) ||
      validUntil <= validFrom ||
      !offerTag(event, 'lud16') ||
      event.content !== ''
    ) {
      return null;
    }

    return {
      event,
      app,
      price,
      recipient: author,
      lightningAddress: offerTag(event, 'lud16'),
      providerPubkey,
      validFrom,
      validUntil,
    };
  } catch {
    return null;
  }
}

export function offerStatus(
  offer: PaymentOffer,
): 'upcoming' | 'active' | 'expired' {
  const now = Math.floor(Date.now() / 1000);

  return now < offer.validFrom
    ? 'upcoming'
    : now >= offer.validUntil
      ? 'expired'
      : 'active';
}

export async function resolveOfferProvider(
  lightningAddress: string,
  price: string,
): Promise<string> {
  const match = /^([^\s@/]+)@([^\s@/:?#]+)$/.exec(lightningAddress);

  if (!match) {
    throw new Error('Enter a Lightning address such as author@example.com.');
  }

  const url = new URL(
    `https://${match[2]}/.well-known/lnurlp/${encodeURIComponent(match[1])}`,
  );

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });

  if (!response.ok) {
    throw new Error(`Lightning endpoint returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (
    data.allowsNostr !== true ||
    typeof data.nostrPubkey !== 'string' ||
    !HEX_KEY.test(data.nostrPubkey)
  ) {
    throw new Error(
      'Lightning endpoint must support Nostr zaps and advertise a valid nostrPubkey.',
    );
  }

  const amount = BigInt(price) * 1000n;

  if (
    typeof data.minSendable !== 'number' ||
    !Number.isSafeInteger(data.minSendable) ||
    typeof data.maxSendable !== 'number' ||
    !Number.isSafeInteger(data.maxSendable) ||
    amount < BigInt(data.minSendable) ||
    amount > BigInt(data.maxSendable)
  ) {
    throw new Error(
      'Offer price must fit the Lightning endpoint’s minSendable/maxSendable range.',
    );
  }

  return data.nostrPubkey;
}

export type CreatePaymentOfferProps = {
  app: string;
  price: string;
  lightningAddress: string;
  providerPubkey: string;
  validFrom: number;
  validUntil: number;
};

export function createPaymentOfferTemplate(
  props: CreatePaymentOfferProps,
): EventTemplate {
  return {
    kind: PAYMENT_OFFER_KIND,
    created_at: Math.floor(Date.now() / 1000),
    content: '',
    tags: [
      ['a', props.app],
      ['type', 'one-time'],
      ['price', props.price, 'sat'],
      ['p', props.app.split(':')[1]],
      ['lud16', props.lightningAddress],
      ['nostrPubkey', props.providerPubkey],
      ['validFrom', String(props.validFrom)],
      ['validUntil', String(props.validUntil)],
    ],
  };
}
