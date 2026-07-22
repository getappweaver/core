import {
  NostrEventContextResponseSchema,
  NostrInteractionRelaysResponseSchema,
  type NostrEventContextRequest,
  type NostrEventContextResponse,
  type NostrInteractionRelaysRequest,
  type NostrInteractionRelaysResponse,
} from '@src/web/nostr-resolution-schema';

import { postJson } from '../utils';

export async function resolveNostrEventContext(
  input: NostrEventContextRequest,
): Promise<NostrEventContextResponse> {
  const response = await postJson<unknown>('/api/nostr/event-context', input);

  return NostrEventContextResponseSchema.parse(response);
}

export async function resolveNostrInteractionRelays(
  input: NostrInteractionRelaysRequest,
): Promise<NostrInteractionRelaysResponse> {
  const response = await postJson<unknown>(
    '/api/nostr/interaction-relays',
    input,
  );

  return NostrInteractionRelaysResponseSchema.parse(response);
}
