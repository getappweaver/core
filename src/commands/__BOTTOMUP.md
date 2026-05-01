---
direct_hash: 58fcd1eebc0625fb1b4d6968ad3905d314761e7fb4eaa524fe6cf2838621d6ef
subtree_hash: 4566f69ee72f3f4e4a38e0ba3c5ca0605d286ce2d14f0e0e6c18814bdb0d850e
files:
  definitions-registry.ts: 57ee43fd148262a20dfb5ac3c11a90273f4ce100c418c1de314f359e7468bc64
  dispatch.ts: 96f191eb0ecd30f74498a981065bfcbdc9ad8394528dabfc8777e080f89dba4f
  parse-prefixed.ts: 39ffd0ce36dc86d1535798c4020d516912be551e5618e56ba2f35c78ce11a10c
  prefixed-handlers.ts: 98733065e450363c243aac20dc9c61fc8a8494e3a732660e671a31a8021e9c08
children:
  ai: 3e0593cccf29a7538f647db45dd17a9020c0c9e1a8b6a5c7e995c14edd526f5d
  bot: 16b9830db3a314837b10670d60fe0aaaa0f560dfe599e09ea04333bfe5c63397
  bunker: a177d6957a60fb3214050241ec55c7ecd756bfbaa42f7cb2d2d1310118ec6e31
  help: 1456a20abf6a47db5f6a888befef3b574e53f3914e0388265d0cf1faf39fbc92
  provider: 0269cb33206912808d5ae0639e557854c17dd7f456be03e7e50764f8c0a7787f
  session: 679b7eafa8782161fba68166367055a1bb2684b656faf6e11478f48e5f900eb8
  shared: 84c37c1f069552de017ae8a89c51d8f33edf957703465af3fb950bbe44b26c17
  wallet: e86de8c817514f75863296d8f1e65ce2a2d607084e8340a0d465b3cc0703703c
  wot: 451d4de53ef7f8e7d8af4153d3d5060edc4b069d9c0adbf484c327a62d69edde
---

# commands

## Purpose
Command routing layer that parses prefixed DM input (e.g. !session new) and dispatches to builtin command handlers or plugins. Maps root command names to definitions and handlers.

## Files
- `definitions-registry.ts` - Registry mapping root command names (help,session,bot,ai,wallet,bunker,wot) to CommandDefinition objects with subcommand trees
- `dispatch.ts` - Main router: parses prefixed input, builds RouteCommandContext, calls builtin handlers or dispatches to plugins, returns text or WebNodeRoot
- `parse-prefixed.ts` - Parses DM input starting with prefix into {cmd, args} or returns null if not a builtin command
- `prefixed-handlers.ts` - Merges all root builtin handlers (help,session,bot,ai,wallet,bunker,wot) into builtinCommandHandlers map

## Notes
- dispatch.ts is the main routing entrypoint accepting RouteCommandProps
- definitions-registry.ts exports BUILTIN_ROOT_NAMES and getBuiltinDefinitionsMap
- prefixed-handlers.ts merges all root builtin handlers into a single map

## Subdirectories
- `ai/` - AI subcommands: mode, backend, model, models, provider - coordinates definition and handler delegation
- `bot/` - Bot management: status, version, ping, identity, workspace, lint, log, ready, push, restart
- `bunker/` - Bunker remote signer: list, add subcommands for managing signers
- `help/` - Help command: builds help text from builtin and plugin command definitions, renderers in representation.ts
- `provider/` - AI provider routing: set, deposit, refund, balance, budget, status, models, sync-models, add-model
- `session/` - Session management: new, attach, resume, resume-last, list, messages with text renderers
- `shared/` - Shared bot status block helper for appending to command responses
- `wallet/` - Cashu wallet: mint, mints, balance, decode, receive, send, history operations
- `wot/` - Web of Trust: crawl (follows), score (trust score), stats (graph metrics)
