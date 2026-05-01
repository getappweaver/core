---
direct_hash: 9a0ef841942aa6df4d473e590eba887863c8d74950f0653b9b0a9dd205bbe491
subtree_hash: f854386e215235dff5688ab3559e995d728094d6d86d39f8244e139bf20be56c
files:
  cli.ts: 157987b1b8008ebc2a0f0657da973bed4138529b1dfd1a473d120010548e5256
children:
---

# list/renderers

## Purpose
CLI renderer for bunker list output. Formats BunkerListRepresentation into human-readable text for terminal display, handling empty and populated list views.

## Files
- `cli.ts` - Exports renderBunkerListCli() - converts BunkerListRepresentation to CLI text with bunker name, user pubkey, remote signer, relays, and creation date

## Notes
- Part of the list feature's render pipeline
- Uses shared format-helpers for pubkey and timestamp display
