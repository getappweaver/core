---
direct_hash: 05817afdd1de4b0cb0b4a54876c0a09a95048f57b16824570a57b50618cfae5c
subtree_hash: 8fe23a64522cdf1658e034a653e0e2664a69268128fb8a5103091a60c328c629
files:
  definition.ts: b85de49992769fbd4c4208c0d83484e3d370bb3ffbb437c7661302aa1ce81c1e
  handler.ts: 89adde8b105c10600d8712b1130ed99d5c5cf28bad67cda34b081898cd704c2b
  representation.ts: 916c049f8288faa60a14a027d53bd6455eabbd60c089080defd926cf357ae347
children:
  renderers: c1815b152dbf774a9f971310ee28d56bd718dcdd0441c97c4c8dfd5a391b9e9b
---

# add

## Purpose
Subcommand implementation for adding bunker signers. Connects to a bunker via URL, retrieves ephemeral keys and relays, then persists the connection to local storage.

## Files
- `definition.ts` - Subcommand definition: args are name (required string) and url (required bunker:// string)
- `handler.ts` - Handler: validates args, connects via bunker, saves to DB, returns success/duplicate representation
- `representation.ts` - Zod schemas for bunker add representation with success/duplicate view discriminators

## Notes
- Returns 'duplicate' view if connection name already exists
- Uses nostr-tools pool for bunker connection
- Renderers directory formats output for terminal display

## Subdirectories
- `renderers/` - CLI output formatter for BunkerAddRepresentation (terminal text rendering)
