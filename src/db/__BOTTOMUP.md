---
direct_hash: de616771d895a8867b79389f567a0305b01c109e3d34147dad5eaefd9ea04228
subtree_hash: 2bb539ad81a95737c652efb041ac9339f9694fca2379251220d53698e37bffd2
files:
  core.ts: 2efae8e40268c45493cd68a4ac68506c9f3bdfcd33a09748de11fe24028eebd3
  shared.ts: 45d974563b0b444640a866019dbb9695768a2697399aa16ab9112ac61e68a391
  state.ts: 39632cd7c1ccd2ce8033969f1530babd74c986029036749f4fa0342838ebcf21
  wot.ts: f8c349ef4e9387c58f38cdf5e7c33907ebbc62f05ee4f599a44c0d1f8fd4db26
children:
---

# db

## Purpose
Core SQLite database for bot state, sessions, configuration, and Web of Trust graph storage. Opened once at startup; passed as DI throughout the app.

## Files
- `core.ts` - Opens core DB, creates tables (seen_events, sessions, session_messages, state, spend_log), delegates table creation to domain modules
- `shared.ts` - Defines schemas (AgentMode, AgentBackendName, ProviderName, ReplyTransport, WorkspaceTarget, Linting, DmCommandPrefix), state key constants, CoreDb branded type
- `state.ts` - Getter/setter functions for all config: mode, backend, transport, workspace target, model overrides, budgets, cached models, linting, command prefix
- `wot.ts` - Web of Trust graph storage and queries: nodes, edges, depth, follower count, weighted support, scores per root pubkey

## Notes
- WAL mode enabled; foreign keys enforced
- State keys follow naming pattern STATE_* in shared.ts
- WoT tables replaced per root on each crawl
