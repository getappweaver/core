---
direct_hash: 4cf40a290a5a1dd648496a57ef55674a61bd4cb2c98b5b3947ad20fc910c9ac7
subtree_hash: 957feb19fc1ed055966bdaef8caad7781044f58728d66cac6a44e689f7fd3450
enriched: true
enriched_version: 1
files:
  core.ts: 45d1e0760cabd83eb717c6faae4cac3b82a4587de6d03cb5a17859369ecec531
  routstr-index.ts: 2f3c33c9a2fe20f5dee75879938cc31459f4df4efff4da66d77ace621f0fc686
  shared.ts: c9d6f90be5c96177ef828bb086be68cc7e42b1c40a608d3e229e0c145301c240
  state.ts: f03233e09a2603606c5d97bcce358afe8ad6d31269358e828c2087dbb674e9c0
  wot.ts: 6e37083973d288f9f05e09c5bdd77986c654389e7b0c4de6a378642cb783cd6a
children:
---

# src/db

## Purpose
Database helpers for the core SQLite store. This directory owns shared DB types/constants, schema initialization, persisted runtime state, Routstr model indexing, and Web-of-Trust cache/query tables.

## Files
- `core.ts` - Opens and initializes the core SQLite database, applies local migrations, creates core tables, and exposes seen-event helpers.
- `routstr-index.ts` - Defines the Routstr provider/model index schema and query/update functions for cached provider model availability and pricing.
- `shared.ts` - Holds shared DB-facing schemas, state key constants, defaults, and the branded CoreDb type.
- `state.ts` - Provides typed getters/setters for persisted bot configuration, setup state, model/provider choices, linting, Routstr secrets, and cached Routstr models.
- `wot.ts` - Creates and maintains Web-of-Trust graph, contact-list, relay-list, and profile cache tables with scoring and lookup helpers.

## Notes
- CoreDb is a branded Bun SQLite database type shared across modules.
- State accessors validate persisted strings with zod and provide defaults for unset or legacy values.
- Schema creation is coordinated by core.ts, which also initializes tables owned by nearby feature modules.
