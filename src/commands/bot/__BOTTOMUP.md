---
direct_hash: c763103e3677587384ab93cb2c65d59e58894173bbf248907ca0089b9f20d25f
subtree_hash: 16b9830db3a314837b10670d60fe0aaaa0f560dfe599e09ea04333bfe5c63397
files:
  cli-representation.ts: 75e87e198267439eee2e22330ab85f5122f71ef02ba820dea303a6d013930ecc
  definition.ts: 1b6cdcff4ab47a287f285f64826132bc50314ad9f8f7e1e27bb76523d0cbc45e
  handler.ts: f1f7db09bcea94ea38465ed8eec3d52e1ba11e7659e634b4e0bd367af48398d2
  request-watch-restart.ts: af0a46b549eb9a3846a727010001a5b02b8c33b9b834b85485fea778baee6330
children:
---

# commands/bot

## Purpose
Root command group for bot-related DM commands (status, version, ping, identity, workspace, lint, log, ready, push, restart). Wires subcommand handlers to CLI renderers via a representation/dispatch pattern.

## Files
- `cli-representation.ts` - Dispatches bot representation types to their CLI text renderers (status, version, ping, identity, workspace, lint, log, ready)
- `definition.ts` - Bot command tree definition with 11 subcommands: status, version, ping, identity, workspace, lint, log, ready, push, restart, help
- `handler.ts` - Root handler that dispatches `bot <subcommand>` calls to per-feature handlers, includes help and usage text
- `request-watch-restart.ts` - Writes restart marker file for watch mode restart signaling

## Notes
- Subcommands use per-feature handlers that return typed representations
- CLI rendering delegated to subdirectory renderers
- Restart uses filesystem marker for watch mode
