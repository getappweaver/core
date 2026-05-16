---
direct_hash: 7a07a9ea39f8483861b68915e695b5682d19756bd65d1c58043a2e160abc3ae9
subtree_hash: 64f9e4445f12105b948843ce848d5ebebe677774bdc57a1c872ab85e8884675d
files:
  definition.ts: e059a93b72dad882c7e7e34a237c6d30d76040e575d60fd838634fbe9f31d270
  handler.ts: 51a916feb20496a73e11b09165b6db29cfccb88bc8db5dc05ffbac3f396ef37d
children:
  renderers: 7f54b7b11941bedad363cf97aeac94554b18c3ac99bb45f94dd683dfd18c6c0c
---

# install

## Purpose
Plugin installer subcommand for the AppWeaver plugin manager. Discovers installable plugins from Nostr kind 32107 events, checks core version compatibility, and routes output to text or web renderers.

## Files
- `definition.ts` - Exports plugin install subcommand definition with web widget metadata
- `handler.ts` - Handles install command: queries Nostr plugin catalog, reconciles installed state, and dispatches to renderers

## Notes
- Queries kind 32107 Nostr events from 4 hardcoded relays
- Reads installed plugins from plugins.json in the AppWeaver root
- Matches catalog plugins to installed ones via repo URL or alias

## Subdirectories
- `renderers/` - Contains text and WebNode renderers for plugin install output, plus an SVG icon
