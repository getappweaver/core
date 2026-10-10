import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { verifyEvent, type NostrEvent } from 'nostr-tools';

import { Satoshi } from './amount';
import { parseLightningInvoice } from './lightning-invoice';

export function singletonZapTag(event: NostrEvent, name: string): string {
  const tags = event.tags.filter((tag) => tag[0] === name);

  return tags.length === 1 ? (tags[0][1] ?? '') : '';
}

export type ValidateZapReceiptProps = {
  receipt: NostrEvent;
  buyer: string;
  recipient: string;
  provider: string;
  app: string;
  offerId: string;
  price: string;
  validFrom: number;
  validUntil: number;
};

export function validateZapReceipt(props: ValidateZapReceiptProps): boolean {
  try {
    const { receipt } = props;

    if (
      receipt.kind !== 9735 ||
      receipt.pubkey !== props.provider ||
      !verifyEvent(receipt) ||
      receipt.created_at < props.validFrom ||
      receipt.created_at >= props.validUntil
    ) {
      return false;
    }

    const description = singletonZapTag(receipt, 'description');
    const request = JSON.parse(description) as NostrEvent;

    if (
      request.kind !== 9734 ||
      request.pubkey !== props.buyer ||
      !verifyEvent(request)
    ) {
      return false;
    }

    for (const [name, expected] of [
      ['a', props.app],
      ['e', props.offerId],
      ['p', props.recipient],
    ]) {
      if (
        singletonZapTag(request, name) !== expected ||
        singletonZapTag(receipt, name) !== expected
      ) {
        return false;
      }
    }

    const senderTags = receipt.tags.filter((tag) => tag[0] === 'P');

    if (
      senderTags.length > 1 ||
      (senderTags.length === 1 && senderTags[0][1] !== props.buyer)
    ) {
      return false;
    }

    const amount = Satoshi.parse(props.price).toMillisatoshi();

    if (singletonZapTag(request, 'amount') !== amount.toString()) {
      return false;
    }

    const invoice = parseLightningInvoice(singletonZapTag(receipt, 'bolt11'));

    return (
      invoice.network === 'mainnet' &&
      invoice.amount?.equals(amount) === true &&
      invoice.descriptionHash ===
        bytesToHex(sha256(new TextEncoder().encode(description)))
    );
  } catch {
    return false;
  }
}

export type CreateZapInvoiceProps = {
  lightningAddress: string;
  provider: string;
  price: string;
  request: NostrEvent;
};

export function invoiceMatchesZapRequest(
  invoice: string,
  request: NostrEvent,
): boolean {
  try {
    const parsed = parseLightningInvoice(invoice);

    return (
      parsed.network === 'mainnet' &&
      parsed.amount?.toString() === singletonZapTag(request, 'amount') &&
      parsed.descriptionHash ===
        bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(request))))
    );
  } catch {
    return false;
  }
}

export async function createZapInvoice(
  props: CreateZapInvoiceProps,
): Promise<string> {
  const match = /^([^\s@/]+)@([^\s@/:?#]+)$/.exec(props.lightningAddress);

  if (!match) {
    throw new Error('Invalid author Lightning address.');
  }

  const endpoint = `https://${match[2]}/.well-known/lnurlp/${encodeURIComponent(match[1])}`;

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error('Author Lightning endpoint is unavailable.');
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (
    data.allowsNostr !== true ||
    data.nostrPubkey !== props.provider ||
    typeof data.callback !== 'string'
  ) {
    throw new Error(
      'Lightning provider changed or does not support this offer. Ask the author to publish a new offer.',
    );
  }

  const amount = Satoshi.parse(props.price).toMillisatoshi();

  if (
    typeof data.minSendable !== 'number' ||
    !Number.isSafeInteger(data.minSendable) ||
    typeof data.maxSendable !== 'number' ||
    !Number.isSafeInteger(data.maxSendable) ||
    BigInt(amount.toString()) < BigInt(data.minSendable) ||
    BigInt(amount.toString()) > BigInt(data.maxSendable)
  ) {
    throw new Error(
      'Offer price is outside the Lightning provider’s invoice range.',
    );
  }

  const callback = new URL(data.callback);

  if (
    callback.protocol !== 'https:' ||
    callback.username ||
    callback.password
  ) {
    throw new Error('Invalid Lightning callback.');
  }

  const description = JSON.stringify(props.request);
  callback.searchParams.set('amount', amount.toString());
  callback.searchParams.set('nostr', description);

  const invoiceResponse = await fetch(callback, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!invoiceResponse.ok) {
    throw new Error('Could not create a zap invoice.');
  }

  const invoiceData = (await invoiceResponse.json()) as {
    pr?: unknown;
    reason?: unknown;
  };

  if (typeof invoiceData.pr !== 'string') {
    throw new Error('Lightning provider did not return an invoice.');
  }

  const invoice = parseLightningInvoice(invoiceData.pr);

  if (
    invoice.network !== 'mainnet' ||
    !invoice.amount?.equals(amount) ||
    invoice.descriptionHash !==
      bytesToHex(sha256(new TextEncoder().encode(description)))
  ) {
    throw new Error(
      'Invoice does not match the signed zap request and exact offer price.',
    );
  }

  return invoiceData.pr;
}
