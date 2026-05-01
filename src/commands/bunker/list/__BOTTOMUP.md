---
direct_hash: 7618789aa01f3ffd4385dbe2f0c7a778517cf8bd20a724b0b3383827a51b68aa
subtree_hash: 47d96f61cffec83386fdd98d67fa1bdc45158a6b55599c07b36c5fc0ced1e6de
files:
  definition.ts: effcb5479bef2c97056901f45b01c76548bf07cad64eda403be12a41a5935478
  handler.ts: 925fb13702219972ad9d141b43c886ad43faf7e2bcfd5ddd9ce87608caff1d43
  representation.ts: 122671db99c09015a458883f3032a140bf97657b14d294ee68c3d247b7bbb3b4
children:
  renderers: f854386e215235dff5688ab3559e995d728094d6d86d39f8244e139bf20be56c
---

# list

## Purpose
Implements the bunker list subcommand - retrieves saved signer connections from DB and returns structured representation.

## Files
- `definition.ts` - Subcommand definition - registers 'list' command name, summary, and example usage
- `handler.ts` - Business logic - queries connections via listConnections(), returns empty or populated list representation
- `representation.ts` - Zod schemas - defines BunkerListRepresentation, BunkerListItem, and discriminated union for view types

## Notes
- Depends on @src/nostr/connections for data access
- Uses Zod schemas to validate representation structure
- Delegates terminal rendering to list/renderers

## Subdirectories
- `renderers/` - CLI output formatter - renders representation to terminal-friendly text for empty and list views
