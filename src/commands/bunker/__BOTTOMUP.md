---
direct_hash: d83ebe1e5b16458c97a6b63ea9965966679399395081a9581e0bfd365493ef68
subtree_hash: 8435e467ba606332b95a09a98e7fab0ad830477dfd1f509352b14f50ae131f44
files:
  cli-representation.ts: 3ad7e819fad9c853d5769ace8052ff16ec9b3ae223afba4a391be17ad1f6217a
  definition.ts: 3ab6d43b3bbfdff9c07d11e8f18bcbb2495d5c8b766d82afcef6a181a0b5a207
  handler.ts: 4788afb238099a11dac550343ebcf6a422d8ef289892cffd89e974d9ce500253
children:
  add: 8fe23a64522cdf1658e034a653e0e2664a69268128fb8a5103091a60c328c629
  list: 47d96f61cffec83386fdd98d67fa1bdc45158a6b55599c07b36c5fc0ced1e6de
  shared: 441566b65cf08d6600772a1e448efb4dd7dfcb538bc90dc3bbc9d18a02c9dba5
  usage: 66e8358547c246248af0915312331b1199e15ddf8c653d2a460e9541abc65684
---

# bunker

## Purpose
Bunker command module for managing remote signer connections. Routes to list and add subcommands via a root handler.

## Files
- `cli-representation.ts` - Dispatches representation to usage/list/add renderers
- `definition.ts` - Defines bunker command tree with help, list, and add subcommands
- `handler.ts` - Root handler routing to subcommand implementations

## Notes
- Represents bunker connections for NIP-46 signing
- Subcommands: list saved signers, add new ones via URL
- Uses ephemeral key exchange pattern

## Subdirectories
- `add/` - Connects to bunker via URL, exchanges ephemeral keys, persists signer connection
- `list/` - Retrieves saved bunker connections from DB
- `shared/` - Pubkey encoding and timestamp formatting helpers
- `usage/` - Usage text representation schema
