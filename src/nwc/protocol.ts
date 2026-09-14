import type { Event as NostrEvent } from 'nostr-tools';

import { NwcRequestError, NwcResponseError } from './errors';
import {
  NwcRequestPayloadSchema,
  NwcResponsePayloadSchema,
  NwcWalletInfoEventSchema,
} from './schemas';
import type {
  NwcRequestPayload,
  NwcResponsePayload,
  NwcWalletServiceInfo,
} from './types';

export const NWC_WALLET_INFO_KIND = 13194;
export const NWC_WALLET_REQUEST_KIND = 23194;
export const NWC_WALLET_RESPONSE_KIND = 23195;
export const NWC_ENCRYPTION = 'nip44_v2';

function tagWords(event: NostrEvent, tagName: string): string[] {
  return event.tags
    .filter((tag) => tag[0] === tagName)
    .flatMap((tag) => (tag[1] ?? '').split(/\s+/))
    .filter(Boolean);
}

export function parseNwcWalletServiceInfo(
  eventInput: unknown,
): NwcWalletServiceInfo {
  const parsed = NwcWalletInfoEventSchema.safeParse(eventInput);

  if (!parsed.success) {
    throw new NwcResponseError('Invalid NWC wallet info event.', parsed.error);
  }

  const event = parsed.data as NostrEvent;

  return {
    walletPubkey: event.pubkey,
    methods: event.content.split(/\s+/).filter(Boolean),
    encryptions: tagWords(event, 'encryption'),
    extensions: tagWords(event, 'extensions'),
  };
}

export function serializeNwcRequest(payload: NwcRequestPayload): string {
  const parsed = NwcRequestPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    throw new NwcRequestError(undefined, parsed.error);
  }

  return JSON.stringify(parsed.data);
}

export function parseNwcResponse(plaintext: string): NwcResponsePayload {
  let value: unknown;

  try {
    value = JSON.parse(plaintext) as unknown;
  } catch (error) {
    throw new NwcResponseError('NWC response is not valid JSON.', error);
  }

  const parsed = NwcResponsePayloadSchema.safeParse(value);

  if (!parsed.success) {
    throw new NwcResponseError(undefined, parsed.error);
  }

  return parsed.data;
}
