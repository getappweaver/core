---
direct_hash: 535256a6cec30a9024e47807c500d371d23fc992bccf263320f29afe99bd938f
subtree_hash: c1815b152dbf774a9f971310ee28d56bd718dcdd0441c97c4c8dfd5a391b9e9b
files:
  cli.ts: 6ff5f6f2363bf4707b2f7657050daa8d1c818909316418d6535791e879795d30
children:
---

# add/renderers

## Purpose
CLI renderer for the bunker add command, formats BunkerAddRepresentation into human-readable terminal output.

## Files
- `cli.ts` - Formats bunker add results for CLI display, rendering success with pubkeys/relays and duplicate name error

## Notes
- Formats success state with name, user pubkey, remote signer pubkey, and relays
- Handles duplicate view for existing bunker connections
- Uses exhaustive switch pattern for future view variants
