---
direct_hash: d91e76139592b6c0ea651eafd97686b06fd0c9d7fcfb3bc854bbc603322728e8
subtree_hash: cfab9ab92da209a6c422cd0bfd3f88b6595efff4f06e4c9b1a15c4edeb736b82
files:
  blossom.ts: 30dc23baeb2e9c86264a8ef8168da5067acaf5b1260b527d9369119ceb7f7cf6
  bunker-sign.ts: db3de28c7263da5bedd6dcec824bc688b678ebd61bba86987a4ce15e922e7f2d
  bunker.ts: 1cd8bc3ac62bd34583125e4f4671b62753ccc403ce5f44efb81e779b80f61942
  connections.ts: 90fe00f51c7238ac8f3d3c055df89ad6ecd0d562f543fa0e6341e8da6c2c897d
  nip17.ts: 1feddc157875d80b757c83a3e9c1a93e3fd46a400eb2c9064cde705bfb8ab28b
  nip23.ts: 07d85a23c74db8b3294176ccac2639ff580018a40cbe1868fe8efc11c405c981
  nip65.ts: d5dca63cec477a2c8c9a044baf2064cb27e34177d294b5b3fb94b1e70e4aa782
  relay-publish.ts: 5fd4c76ac90e4d5f26fef1a5b24672266310000624126e255c5234441b7ce5b6
  wot.ts: 295957642a34224540167ae0da5a2b77436a1857464af6f2e3d969b0f6f1aec8
children:
---

# nostr

## Purpose
Nostr protocol helpers: Blossom BUD storage (server lists, auth, upload/mirror), NIP-46 bunker remote signing, NIP-17 DMs, NIP-23 long-form articles, NIP-65 relay lists, and WoT contact crawling.

## Files
- `blossom.ts` - Blossom BUD blob storage: server list event (10063), auth (24242), upload/mirror/delete HTTP operations, sha256 URL parsing
- `bunker-sign.ts` - Interactive bunker signing for plugins: prompts user to approve/AI-edit event templates, picks from saved connections
- `bunker.ts` - NIP-46 bunker client: connect, sign_event, get_public_key; parses bunker:// URLs, handles NIP-44 encrypted requests/responses
- `connections.ts` - Persisted bunker connections stored in core DB: CRUD for named signer configs with ephemeral session keys
- `nip17.ts` - NIP-17 DM: wrapEvent/unwrapEvent (kinds 14/15), sendDm, createDmSubscription with auto-reconnect, profile relay discovery (10050)
- `nip23.ts` - NIP-23 long-form content: kind 30024 draft builder, kind 30023 publish, parseNip23LongFormFromEvent, slugifyForDTag
- `nip65.ts` - NIP-65 relay lists: kind 10050 parse, fetchWriteRelays, PROFILE_RELAYS constants for discovery
- `relay-publish.ts` - Per-relay publish with logging: publishSignedEventToRelays, summarizeRelayOutcomes, RelaySuccess/RelayFailure types
- `wot.ts` - Web of Trust crawler: crawlWot fetches contact lists (kind 3) to max depth, stores nodes/edges in DB, normalizePubkeyInput (hex/npub)

## Notes
- All files use nostr-tools for core Nostr operations
- Blossom auth uses kind 24242 with Nostr-authorized base64 payloads
- Bunker signing encrypts NIP-46 requests with NIP-44
