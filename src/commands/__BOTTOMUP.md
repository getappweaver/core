---
direct_hash: 50a6cec2f41088482520b7848b37a2a4f9b4b3e4fc5ded85d690d3a1370b7031
subtree_hash: 80810a67441a51339c1669c85ce829e1f02f028ebe4c9d10336676087cc3c9f4
files:
  definitions-registry.ts: d003dd78c4d5e6f82dbe6bb163ec08b2c167f94034c481a0df9b484687060fba
  dispatch.ts: 8f04789bdd28d49fff3986538e62b430e41808144d58635a2fbc8f62db0f9e24
  parse-prefixed.ts: 39ffd0ce36dc86d1535798c4020d516912be551e5618e56ba2f35c78ce11a10c
  prefixed-handlers.ts: 115421d61d0562f0d21fbcb7d1bdf80938a28e0fe6b89f2beff004b3d8dc5ea7
children:
---

# src/commands

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
