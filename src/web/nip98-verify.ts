// ---------------------------------------------------------------------------
// src/web/nip98-verify.ts — shared NIP-98 (kind 27235) verification
// ---------------------------------------------------------------------------

import type { NostrEvent } from 'nostr-tools';
import { verifyEvent } from 'nostr-tools';

const NIP98_KIND = 27235;
const NIP98_WINDOW_SECS = 60;

export type VerifyNip98AuthorizationParams = {
  authorizationHeader: string | null;
  /** Request pathname, e.g. `/ws` or `/api/commands`. */
  pathname: string;
  requestMethod: string;
  masterPubkey: string;
};

export type VerifyNip98AuthorizationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function verifyNip98Authorization(
  params: VerifyNip98AuthorizationParams,
): VerifyNip98AuthorizationResult {
  const { authorizationHeader, pathname, requestMethod, masterPubkey } = params;

  if (!authorizationHeader?.startsWith('Nostr ')) {
    return { ok: false, reason: 'missing_auth_header' };
  }

  const token = authorizationHeader.slice('Nostr '.length).trim();
  let event: NostrEvent;

  try {
    event = JSON.parse(atob(token)) as NostrEvent;
  } catch {
    return { ok: false, reason: 'invalid_token' };
  }

  if (!verifyEvent(event)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  if (event.kind !== NIP98_KIND) {
    return { ok: false, reason: 'wrong_kind' };
  }

  if (event.pubkey !== masterPubkey) {
    return { ok: false, reason: 'wrong_pubkey' };
  }

  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(event.created_at - now) > NIP98_WINDOW_SECS) {
    return { ok: false, reason: 'event_expired' };
  }

  const urlTag = event.tags.find((t) => t[0] === 'url')?.[1];
  const methodTag = event.tags.find((t) => t[0] === 'method')?.[1];

  if (!urlTag || !methodTag) {
    return { ok: false, reason: 'missing_tags' };
  }

  let tokenPath: string;

  try {
    tokenPath = new URL(urlTag).pathname;
  } catch {
    return { ok: false, reason: 'invalid_url_tag' };
  }

  if (tokenPath !== pathname) {
    return { ok: false, reason: 'url_mismatch' };
  }

  if (methodTag.toUpperCase() !== requestMethod.toUpperCase()) {
    return { ok: false, reason: 'method_mismatch' };
  }

  return { ok: true };
}
