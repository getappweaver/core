---
direct_hash: e7fcfa34ebd8d8301b9319af7a631a17829c4df28d867e05066887212931ed55
subtree_hash: 39fd6cdf652d09961b2af4df206f6792689a76ea6299bfefbe7555e08ee9a634
files:
  budget-annotation.ts: 3083f3eff2c72deee669a6d29e07a2b72cec7357beff20b289fa761f54468c48
  cli.ts: fd7e3a7501454fae4f9df7267e50fca3fff2e2038596a21352a2022393a2596a
  db.ts: e76c843144494abd60430f8c8b6448aa3e72effe7c9c066424fe1cb5e30446ff
  env-file.ts: 6df1447a6462e837549385c5f616b8fc74eb7e355a80043d12be1723dfb9fb9c
  env.ts: 64528a71cb8dd2a62a60de349644506962e1190367edcbc1e6f2d407d4b64a0f
  index.ts: 1febd0da6aafd74c24953c2b859ed5be64b008d718cc6639b465d0ca1e44a297
  lint.ts: 3c069f2c094f950b4245d772d56060903bf6db60491ff6b5e7994098412dcfc5
  logger.ts: 7e366ed33ae2493b57d85ae7dc816e4c9b6cfd1441c019f500445d60a34e7d1c
  messaging.ts: 0817e74c68e136876429a5114c3de7ca5c03e51cf946ad1dd7e317d688b9d3f0
  paths.ts: 0f6fa3be197210dba526967199d8517645384a1110e9b0907ed75f40f3fa9bbc
  prompt-session.ts: 4db2dac644c32daad7aa2e77229453e299098389b10e5462820fc35ae8af0405
  session.ts: 8af1d03192ac243851b874f2b77ba8219a98d890c5b4e2dcd6db3a5fbff93a49
  types.ts: d884d794147ca3154538f5338ee9952ec4d2d24b9903ac9fe76cd245a3a93995
  utils.ts: d37abd7356369e06c55838c8bc38fdf8282d395d0ca411aab4a65f02bbe367b0
children:
  backends: d9343ad669621c5294962b9444104579aad4240de893c3ad09b06e9901735311
  cli: 8fba8fd214ba5b50942a131d33010b7a18b4e02e53b94bd86d1d3f11fffd84bf
  commands: 4566f69ee72f3f4e4a38e0ba3c5ca0605d286ce2d14f0e0e6c18814bdb0d850e
  core: 8fb1aaa52bafe1f0e0508c2f233c22bc0a090c9fc6922c16865e22d4368bab7a
  db: 2bb539ad81a95737c652efb041ac9339f9694fca2379251220d53698e37bffd2
  flow: c5d0f42191b37484c43565834be83eb075b6ca55a8e97d48df3782c4c8c8f5b5
  nostr: cfab9ab92da209a6c422cd0bfd3f88b6595efff4f06e4c9b1a15c4edeb736b82
  providers: 815f69828d4eb19a15bde49c6afb2209efebd4f0226372d1559c4b9ccc207d34
  system: 754c4baab8fe7cce6875a2690ba1d9d38dd8e35509da09162703e5e3a535551d
  timeline: 77e0d46f5e1d8e047018ba56e9b04ceeadd59e4061c243b186f55e25eebb3aeb
  tools: 3eccbed956949daf9797eabc38e833d05c7e245f1cdde10d3fda43ad86d05025
  wallets: 8ee54a2354c8aff1475c921903a0b6912d73ce10661e13a1a6f955e778dd9b3c
  web: d1e427e6085afbf78a70e5e374927b7306e066c8f5cf1a94b96234cb62f05e40
---

# src

## Purpose
Source root for AppWeaver's NIP-17 command runtime that listens on encrypted Nostr DMs and routes commands to plugins. Entry point is index.ts; cli.ts serves as the local CLI runner for plugin tool invocations. Uses Bun SQLite for state, nostr-tools for protocol, and a provider abstraction for LLM backends.

## Files
- `budget-annotation.ts` - Extracts !!N sats budget annotations from prompt strings for paid provider flows.
- `cli.ts` - CLI runner for plugin tools: parses alias/tool/args, validates against Zod schema, and calls executeTool from the plugin module.
- `db.ts` - Re-exports core, shared, state, and wot database modules.
- `env-file.ts` - Reads/writes .env keys without duplication; used by bot:setup to persist generated secrets.
- `env.ts` - Loads bot config from process.env: keys, relays, master pubkey, cashu, web push, browser settings.
- `index.ts` - Main entry point: initializes Nostr pool, core DB, plugin context, web server, and subscribes to NIP-17 DMs.
- `lint.ts` - Runs `bun run lint` post-agent-edit and formats output for display.
- `logger.ts` - Console helpers with DEBUG toggle, INFO control, and ANSI color constants.
- `messaging.ts` - Chunks long messages to ≤4200 chars with exponential backoff; sendReply factory for nostr/local/web sources.
- `paths.ts` - Derives dmBotRoot from import.meta.dir; exports core DB and restart request paths.
- `prompt-session.ts` - Defines PROMPT_SESSION_EXIT sentinel for !exit in interactive prompt sessions.
- `session.ts` - Session CRUD: create/get/set current session, insert messages into session_messages table.
- `types.ts` - Branded Msats and Sats numeric types with conversion and formatting helpers.
- `utils.ts` - assertUnreachable helper for exhaustive switch/if checks.

## Notes
- env.ts and env-file.ts handle config from env vars and .env persistence
- messaging.ts provides chunked reply sending with exponential backoff for Nostr DMs
- types.ts defines branded Msats/Sats types to prevent monetary value confusion

## Subdirectories
- `backends/` - Agent backend implementations for different AI coding assistants. Provides cursor (CLI), opencode (CLI), and opencode-sdk (in-process) backends with a common interface for session creation and message execution.
- `cli/` - Local terminal chat interface using readline. Accepts user input and processes messages asynchronously with special handling to prevent deadlocks when plugins await prompt input.
- `commands/` - Command routing layer that parses prefixed DM input (e.g. !session new) and dispatches to builtin command handlers or plugins. Maps root command names to definitions and handlers.
- `core/` - Core plugin system: defines the BotPlugin interface and lifecycle (onInit/handler), PluginContext with shared utilities (pool, runAgent, sendReply, promptFn, etc.), and a registry for dispatching commands to plugins by alias.
- `db/` - Core SQLite database for bot state, sessions, configuration, and Web of Trust graph storage. Opened once at startup; passed as DI throughout the app.
- `flow/` - Orchestration layer for agent conversation execution. Handles session management, provider initialization, budget annotation parsing, auto-flow deposits/refunds for paid providers, and optional lint follow-up rounds.
- `nostr/` - Nostr protocol helpers: Blossom BUD storage (server lists, auth, upload/mirror), NIP-46 bunker remote signing, NIP-17 DMs, NIP-23 long-form articles, NIP-65 relay lists, and WoT contact crawling.
- `providers/` - Abstraction layer for LLM provider backends supporting 'local' (no payment) and 'routstr' (Cashu-backed payment). Factory pattern creates providers; spend tracking is centralized in db.ts.
- `system/` - Command/subcommand infrastructure for CLI and web. Defines types, parses CLI input, and orchestrates subcommand execution with a handler-to-representation-to-renderer pipeline.
- `timeline/` - Stores and retrieves conversation events for timeline display, including chat messages, prompts, and command interactions.
- `tools/` - Shared utilities for parsing AI tool output. Handles extraction of JSON from raw model responses (including code fences) and validates results against Zod schemas. Supports both single-object JSON and JSONL formats.
- `wallets/` - Local Cashu ecash wallet with SQLite persistence for proofs and counter state. Provides send/receive token operations and tracks wallet history.
- `web/` - HTTP/WebSocket API for local bot discovery and command execution. Provides web UI shell (shell.html), JSON endpoints for chat/commands, and WebSocket /ws for real-time interactive sessions.
