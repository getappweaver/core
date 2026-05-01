---
direct_hash: adee88cd400f98c5ecfa2f8b9788fd3048037b9490cb89a7b74b7d321468103d
subtree_hash: 451d4de53ef7f8e7d8af4153d3d5060edc4b069d9c0adbf484c327a62d69edde
files:
  adapter.ts: 5737337cd455bba20e2438ab56f1b342016708d0b8d13dbf84226d4d14786d1f
  db.ts: 6d05228efef9783ab91c10ae755461ae4b9ac986394c04e2cca718da047ffd2e
  definition.ts: 1cf7041135b446a478b767dc059c013106532d7ff50dca3c5ff6b8d55fd6ce27
  handlers.ts: 482c69a959b61af6deecde2f4e1fc5a5881c009f681d76b65917f1a1442a13ab
  index.ts: 6e4c2b8a3d3d87d97bd3e0e3a1cb84cb44601a5f415a38180011e16115161ed8
  types.ts: 47ede5569448c106a7286dfd2ae64c4508cad31874aa2f8220c9ae2300316135
children:
---

# commands/wot

## Purpose
WoT (Web of Trust) command module with three subcommands: crawl (fetches follow relationships), score (returns node's trust score), and stats (shows graph metrics). Routes through handlers.ts which delegates to handleWot in index.ts.

## Files
- `adapter.ts` - Pass-through adapter that aliases RouteCommandContext to WotBuiltinInput
- `db.ts` - Placeholder noting WoT reads from ctx.seenDb
- `definition.ts` - Command definition with help, crawl, score, stats subcommands and their argument specs
- `handlers.ts` - Entry point: routes 'wot help' to renderer, other subcommands to handleWot
- `index.ts` - Implements handleWot: parses args for crawl/score/stats, calls crawlWot, getWotScoreDetails, getWotRootStats from db
- `types.ts` - Type alias WotBuiltinInput = RouteCommandContext

## Notes
- WoT data is stored in ctx.seenDb
- Crawl requires pool, db, rootPubkey, maxDepth; score requires target and optional root pubkey
