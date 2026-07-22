---
direct_hash: 72ee35099fff7726d85332c19a9b3fd9fd9a7183205801fd997db5858dcab6cf
subtree_hash: 60b52b39f8d0f3eb94d7b9a83d53dfadc4ff555e60cd3204dbb94b7b9132ae9e
files:
  plugin.ts: 4f5dcd6993dafde0fc758cdf3d00adaabf334eb3904fa376dd7dffb18295eec4
  registry.ts: 487434d0660ebfb35ec800ef2668db16ac98924b104f6eb07e23e50b55764c98
  update-check.ts: fd1f3fb78dd719f77894a50ea2414fb2cd086e5c646db92e532e6427ea98301c
children:
---

# src/core

## Purpose
Core infrastructure for AppWeaver plugin integration and self-update status. It defines the plugin contract, keeps the in-memory plugin registry, and exposes a git-backed core update checker.

## Files
- `plugin.ts` - Defines plugin-facing types, prompt payload helpers, plugin metadata validation, and the BotPlugin contract used by registered plugins.
- `registry.ts` - Maintains the alias-keyed plugin registry and dispatches plugin commands, aliases, and help text.
- `update-check.ts` - Creates a core update checker that fetches git upstream state, compares package versions, builds changelog snapshots, and can fast-forward pull updates.

## Notes
- Plugin handlers return web UI handler results and receive shared runtime context.
- Plugin package metadata is validated from each plugin's package.json.
- Update checks depend on the current git upstream and package.json versions.
