---
direct_hash: 958fdff9b14ae260cc2ab3e2ed07a605dc9ec57a18d5496da9e4732233910635
subtree_hash: ea4feddfc466ad923328d7689d54d52c13aa2c1e4ccdca910b5fa07f301cd36d
enriched: true
enriched_version: 1
files:
  bunker.ts: 05914437b31d17cabd6198f218d976b894954ebec9a669e5c5b4d336f2258395
  bunkerConnections.ts: ccfc6d4f6aa97099f03c40ad31eb231368033462eb61a3a90630ed27df058f1f
  connect-qr.ts: 0d0948be9d1b08e484c6707bc218c365be9207680082649b86ff44dc03e3b8d2
  interactionState.ts: bebd29f4280cb8367fc0cf43aab52ae7862c9bc6cbce14920f77addc19e59c63
  likeEventAction.ts: 4c8561866f783f52e3db2b6ac36c20d34f32bc10b88d2197d3868e85290b9b09
  nip55.ts: 4ace094149c2cf0f06291ffca745657d0f35652b696aae276fc048efef9d3a25
  profileAction.ts: f981c5763c7a133828f90ff627f654ce729bfe3dd9ab97051f1490b413b67007
  publishKind1Action.ts: 0c9f39d94e8df8c54bf4b83dce4e379f8af1aef95036c3a6f8bec63aeb363ea4
  relayLists.ts: 60bb7697c8f2a6d15ca29eda4b93fdd685338d3a4b5a074b7a81ccd2ad64a426
  replyEventAction.ts: 65f15f8329ef87e943f0640aa6100219eee08c1ec2890dadd1196cef0f144212
  repostEventAction.ts: f1a6ea7cd587062c79b03faf283ba44e1c7569a96bc7d1e4866a885103613a17
  searchRelays.ts: 7ec89a26239688dae9ca327725d301ac63cad80c19d7d86185b8db0f67cdd2e6
  storage.ts: 38edba7000c1280a707745ac56b1f4b5015f7666de78f7721d861df4447349e7
children:
---

# web/src/nostr

## Purpose
Browser-side Nostr support for the web UI. This directory handles signer connections, local signer persistence, relay discovery/publishing, and client actions for publishing or interacting with Nostr notes and profiles.

## Files
- `bunker.ts` - Browser-safe NIP-46 bunker and Nostr Connect client for connecting remote signers and signing events.
- `bunkerConnections.ts` - Small API client for listing and saving named bunker signer connections.
- `connect-qr.ts` - Generates high-contrast SVG QR codes for Nostr Connect URIs.
- `interactionState.ts` - Solid signal store tracking local like, reply, repost, and quote flags per user/event.
- `likeEventAction.ts` - Client action handler that signs and publishes Nostr kind 7 likes and records the interaction.
- `nip55.ts` - Amber/NIP-55 browser integration for requesting a public key or signed event via nostrsigner URIs.
- `profileAction.ts` - Profile panel and follow/unfollow action logic, including metadata fetch, latest-post rendering, and contact-list publishing.
- `publishKind1Action.ts` - Generic client action for signing and publishing a Nostr event, then returning an on-success command.
- `relayLists.ts` - Shared NIP-65 relay-list helpers for finding read/write relays and publishing events.
- `replyEventAction.ts` - Reply panel and send-reply handlers that fetch thread context, sign kind 1 replies, publish them, and record interactions.
- `repostEventAction.ts` - Repost/quote panel and publishing handlers for NIP-18 reposts, generic reposts, and quote posts.
- `searchRelays.ts` - Loads and saves a user's NIP-51 search relay list, including optional encrypted private relay tags.
- `storage.ts` - localStorage persistence and validation for browser Nostr signer state across bunker, NIP-07, NIP-55, and NIP-49 signers.

## Notes
- Action handlers generally validate WebAction payloads with zod, update chrome UI state, request signing, publish to relays, and report interaction records.
- Bunker/Nostr Connect data uses the shared BunkerSignerData shape persisted locally or via bunker connection API.
