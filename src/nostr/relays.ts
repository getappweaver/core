// ---------------------------------------------------------------------------
// src/nostr/relays.ts — centralized discovery + publish relays
//
// Two discovery families (do not merge):
// - NIP-65 (kind 10002): indexed widely, vertexlab is fine here.
// - DM discovery (kind 10050): historical list used for DM/profile discovery.
//   vertexlab does NOT serve kind 10050, so it must stay out of this list.
// ---------------------------------------------------------------------------

/** Relays used to find a pubkey's NIP-65 (kind 10002) relay list. */
export const NIP65_DISCOVERY_RELAYS: readonly string[] = [
  'wss://relay.vertexlab.io',
  'wss://relay.nos.social',
  'wss://user.kindpag.es',
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
];

/**
 * Relays used to find a pubkey's DM relay list (kind 10050).
 * Excludes vertexlab — it does not return kind 10050 events.
 * Restores purplepag.es which does index 10050.
 */
export const DM_DISCOVERY_RELAYS_10050: readonly string[] = [
  'wss://purplepag.es',
  'wss://relay.nos.social',
  'wss://user.kindpag.es',
  'wss://relay.nostr.band',
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
];

/** Relays used when publishing the bot profile (kind 0). */
export const PROFILE_PUBLISH_RELAYS: readonly string[] = [
  'wss://relay.vertexlab.io',
  'wss://relay.nos.social',
  'wss://user.kindpag.es',
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.0xchat.com',
];
