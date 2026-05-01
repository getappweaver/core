---
direct_hash: 3709fd16afd37e0a529d5c68abbc282bac1278fd9fe19eab24a6c13b106c46ce
subtree_hash: 0269cb33206912808d5ae0639e557854c17dd7f456be03e7e50764f8c0a7787f
files:
  cli-representation.ts: 4620e1b011c1bdc4d6127de2b2e5f64e832a037e127a51a13b2a69d943d1a1cc
  handler.ts: 51199e21a91a1879322cf4dec9c53adbaaf594ec8c7ef77d8b19d3bb5b0b667e
children:
---
# commands/provider

## Purpose
Provider command subsystem for AI routing: handler.ts dispatches subcommands (set, deposit, refund, balance, budget, status, models, sync-models, add-model) to per-command handlers, then renders results via cli-representation.ts.

## Files
- `cli-representation.ts` - Routes provider representation objects to subcommand renderers and returns CLI text string
- `handler.ts` - Entrypoint for provider subcommands; calls handlers then pipes output to cli-representation for rendering

## Notes
- Both files act as central dispatchers
