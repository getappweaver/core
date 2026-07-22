---
direct_hash: d63a8604af9f5681844a239748e29a9de630c8da4f5c07d3209e72328de576c8
subtree_hash: 8153206cb759ff5ab7cad6d828454b8bf68f582906f34035b99c3a9b796dbbae
enriched: true
enriched_version: 1
files:
  author-identity.ts: bd2c1bbf39ae79a109ce71a64c3adf3bccc07f0191ec5bd4c05286d999acb6ac
  blossom.ts: 30dc23baeb2e9c86264a8ef8168da5067acaf5b1260b527d9369119ceb7f7cf6
  bunker-sign.ts: fb1f0188a927dd6b8f354f56a8693c6885cc3472c171ca3f77f7737bbffdd83d
  bunker.ts: 6d0699abc82e2baa59ca89a6e5c11ec84d9fbd2e4ad0dcf6e440d1e90ca32703
  connections.ts: 90fe00f51c7238ac8f3d3c055df89ad6ecd0d562f543fa0e6341e8da6c2c897d
  nip17.ts: b1ecfe0b084d6dd65c157989978fb30724ba35ec766835d2b31c2cd8bc86c1dc
  nip23.ts: 07d85a23c74db8b3294176ccac2639ff580018a40cbe1868fe8efc11c405c981
  nip65.ts: 8c2337c72a211bb83e926b597bbd0fb7dd768620f1525925d616e605cb009513
  node-query.mjs: 7355cb8be2bb7531d9724cb5b8449e6b363e42693fd2fecc516db61b1dd629c4
  node-query.ts: 78a2712bf2cbfb82dbf728cf53538ee28e8c2a07e54c58227ac546b99965966d
  relay-notices.ts: c202c78d2fc4be40e4401db93fd3c7a3fca7c3a35e81e0f095219fb7169f9ca0
  relay-publish.ts: 3e27869e0cf8da4d5565bd7acf0a30dcd7c9b84c02d70829adcf0a89c746ce05
  repo-address.ts: adc1886b2d70d8dc0952b23fb5467f34c8f2b0ba4dfaa657a73606dd12588fe1
  wot-service.ts: c87166b02d96db9b3ce1d37c2e39b204f74d55a3c62aa1dcbfd7cdf808281825
  wot.ts: 295957642a34224540167ae0da5a2b77436a1857464af6f2e3d969b0f6f1aec8
children:
---

# src/nostr

## Purpose
Nostr protocol support for AppWeaver lives here: identity resolution, relay discovery/publishing, encrypted DMs, remote signing, Blossom media, long-form posts, repo addresses, and Web of Trust caching/crawling. Files expose reusable helpers around nostr-tools plus small adapters for local DB persistence and node-based querying.

## Files
- `author-identity.ts` - Builds displayable author identities, npub/NIP-05 links, NIP-05 verification, and NIP-05 pubkey/relay resolution.
- `blossom.ts` - Provides Blossom server-list discovery, auth event creation, upload/mirror/download/delete HTTP helpers, hashing, and encrypted blob decryption.
- `bunker-sign.ts` - Interactive signing wrapper that lets plugins review or AI-edit event templates before selecting or creating a NIP-46 bunker connection.
- `bunker.ts` - Standalone NIP-46 remote signer client for parsing bunker URLs, connecting, signing events, and delegating NIP-44 encrypt/decrypt calls.
- `connections.ts` - Persists named Nostr signer connections in the core DB with schema validation and CRUD helpers.
- `nip17.ts` - Implements NIP-17 DM auth, relay discovery, gift-wrapped sending, and resilient subscription handling for bot/master messages.
- `nip23.ts` - Builds and parses NIP-23 long-form draft/published article events and slugifies stable d-tags.
- `nip65.ts` - Normalizes relays and fetches/parses NIP-65 relay-list metadata with profile-relay fallbacks.
- `node-query.mjs` - Node subprocess script that performs a nostr-tools SimplePool query from JSON stdin and returns JSON stdout.
- `node-query.ts` - Bun-side adapter that spawns node-query.mjs, logs diagnostics, and returns queried events safely.
- `relay-notices.ts` - Tracks relay NOTICE messages that indicate read limits and suppresses future non-DM read requests to those relays.
- `relay-publish.ts` - Publishes a signed event to each relay independently and summarizes per-relay success or failure.
- `repo-address.ts` - Parses and builds nostr:// repository addresses with author hints, repo IDs, and optional relay hints.
- `wot-service.ts` - Creates cached WoT services for scores, follow lists, profiles, relay lists, and relay-to-author grouping.
- `wot.ts` - Normalizes pubkeys, batch-fetches kind 3 contact lists and kind 10002 relay lists, seeds both into the shared cache, and crawls contact-list follows into the core WoT graph.

## Notes
- Most network helpers accept a SimplePool and explicit relay lists.
- Bunker connections are persisted in the core DB and can sign, encrypt, or decrypt via NIP-46.
- Relay normalization and fallback profile relays are shared across identity, Blossom, WoT, and repo-address flows.
