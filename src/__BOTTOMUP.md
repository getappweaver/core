---
direct_hash: 9f430bce056e6c5a32ec49c4faee74fd17a198b6c3203f1c050a8d43840690aa
subtree_hash: 4fa3c0359410a2518dbe393cfdb5161e37dd98746a45aa68ad9bdbd4b5e81898
files:
  appweaver-relay.ts: 4d14db835b71105c8e1279b52c536846ef93eff3835b74eaa16dba652244c443
  budget-annotation.ts: 3083f3eff2c72deee669a6d29e07a2b72cec7357beff20b289fa761f54468c48
  cli.ts: b4b42ec14e4d6c1c35b68f68b104f66e5248565fb45dba0227598773757bc248
  db.ts: 6188eaf3487585ad974bf0b7c7cb4154ecc379a1d87d8d008245cc2ee073b581
  demo-mode.ts: 775d0fef37b36fc3bf36bcc0c691e7561e0afda2b72e69eea89e390e3573a8ca
  env-file.ts: 6df1447a6462e837549385c5f616b8fc74eb7e355a80043d12be1723dfb9fb9c
  env.ts: d32f69773e6f2e7bdaa49f68067c3ed90ad5efa9f0c7cc1432f1af3d34fc8770
  executable.ts: 64a8fe264541654bda5d70a655f4be2ab92c0d1b217582bf2b8631fe2662da05
  index.ts: 72d2273d3441aa90ae0a22a528d5863740bc1c37d4fafe1994f304492ac05d47
  lint.ts: 3c069f2c094f950b4245d772d56060903bf6db60491ff6b5e7994098412dcfc5
  logger.ts: 81a442a369b0662098e64875c8e72eed55c9654ec2c84e8f2b935c603abffd9a
  messaging.ts: 89b6b8bee332b3b629fb6bb2851863c56423f88d4e05753dd3db6928d5807fcb
  paths.ts: 4aa8f6cc5f313318fe5b7e749af648153d682425e41601f478767a5d75bcf1fd
  prompt-session.ts: 4eaf2ae9f8c26a04ab0762f834099dadfd6323ea71a3e256de388002a296dd80
  session.ts: 8af1d03192ac243851b874f2b77ba8219a98d890c5b4e2dcd6db3a5fbff93a49
  types.ts: d884d794147ca3154538f5338ee9952ec4d2d24b9903ac9fe76cd245a3a93995
  utils.ts: d37abd7356369e06c55838c8bc38fdf8282d395d0ca411aab4a65f02bbe367b0
  workspace-assets.ts: 2f73b9c7d20080580c5d117da387405a771728bb8bccf6c5a89495ac6fd26f31
children:
  backends: 3295259b4cf5cbbdbb3a367f1f65162a46f4743f1e9cd833eb0305f16b986be5
  cli: 6be4a1d38284a460cdb2f74b1cddea64cc76502016ab84f605f9fdc87237e95d
  commands: 80810a67441a51339c1669c85ce829e1f02f028ebe4c9d10336676087cc3c9f4
  core: 60b52b39f8d0f3eb94d7b9a83d53dfadc4ff555e60cd3204dbb94b7b9132ae9e
  db: 957feb19fc1ed055966bdaef8caad7781044f58728d66cac6a44e689f7fd3450
  flow: fae4444a3701c7371cf5ff5a87dbbb764c8c764ccb2a460ae8c7226c402f8ba0
  nostr: 8153206cb759ff5ab7cad6d828454b8bf68f582906f34035b99c3a9b796dbbae
  providers: c74249e4cf41a4185ad37c79d56302dac455d5684695deffb68795a8bb2f2b21
  stories: 2b71bd8f3dca718f626f0af7d9d2b0956444562525aa90ff55f22a21888ad1f7
  system: c78d737f88b0b0d9297ccecdb84c16be6ce5a4a9ea667775dd3415d0dc6ef3b4
  timeline: dcd9e936ab20d8c0729e7990f3074301613ff2afbbb670ab85a3045d9e6db32f
  tools: 3eccbed956949daf9797eabc38e833d05c7e245f1cdde10d3fda43ad86d05025
  wallet: c22fe0b23fb9028a526950a6111ad74004855044600e796a602e141d40d2cda8
  web: 16cb6163a52d9f5e24bcfa9de1eeb68f7b13cca86337f253a801ec0823781190
---

# src

## Purpose
The src directory is the AppWeaver runtime core: startup, configuration, messaging, sessions, plugin CLI execution, and shared primitives. Its subdirectories contain the backend adapters, command routing, database layers, protocol integrations, wallet, and local web server support used by the main bot process.

## Files
- `appweaver-relay.ts` - Exports the AppWeaver relay URL with an environment override and localhost default.
- `budget-annotation.ts` - Parses trailing budget annotations like !!100sats from user prompts.
- `cli.ts` - Runs installed plugin AI tools from the local command line, including schema validation, DB/context setup, execution, and optional JSONL logging.
- `db.ts` - Re-exports the core database modules as the top-level DB import surface.
- `demo-mode.ts` - Detects demo mode from CLI flags or APPWEAVER_DEMO.
- `env-file.ts` - Reads, writes, removes, and initializes keys in .env-style files without duplicating assignments.
- `env.ts` - Parses required and optional environment variables into bot, Nostr, browser, Routstr, Cashu, and Web Push configuration.
- `executable.ts` - Finds executable paths across PATH with platform-aware Windows extension handling.
- `index.ts` - Main bot entrypoint that initializes config, databases, Nostr subscriptions, web server, plugins, command routing, prompt handling, and agent conversations.
- `lint.ts` - Runs and formats the post-agent lint command for active workspace verification.
- `logger.ts` - Provides ANSI color constants plus debug, info, warning, error, and separator logging helpers.
- `messaging.ts` - Handles reply chunking, mode/token formatting, delays, and dispatch of replies to Nostr or local terminal sources.
- `paths.ts` - Centralizes project-root, database, restart-signal, and parent-workspace path resolution.
- `prompt-session.ts` - Defines the sentinel value used to exit interactive plugin prompt sessions.
- `session.ts` - Creates, selects, persists, and retrieves agent backend sessions and session messages in the core DB.
- `types.ts` - Defines branded sats/msats value types with conversion, formatting, and raw access helpers.
- `utils.ts` - Contains the shared assertUnreachable exhaustiveness helper.
- `workspace-assets.ts` - Installs OpenCode/agent assets into a parent workspace by symlinking AppWeaver guidance, copying templates, and updating gitignore when needed.

## Notes
- index.ts is the runtime entrypoint for bot startup and message handling.
- cli.ts is the local plugin tool runner used by agent skills and shell workflows.
- Top-level files mostly expose shared utilities or narrow cross-cutting services used by subdirectories.

## Subdirectories
- `backends/` - Backend implementations and contracts for running AI agent sessions through Cursor or OpenCode.
- `cli/` - Local readline-based chat interface for terminal input and plugin prompt coordination.
- `commands/` - Prefixed command parsing and dispatch for builtin commands and plugin command handlers.
- `core/` - Plugin integration contracts, registry support, and core update checking.
- `db/` - Core SQLite schema, state, Routstr index, and Web-of-Trust persistence helpers.
- `flow/` - Agent conversation orchestration, including sessions, providers, budgets, payments, refunds, and lint follow-up.
- `nostr/` - Nostr identity, relay, DM, signing, Blossom, publishing, repo, and Web-of-Trust helpers.
- `providers/` - LLM provider abstraction for local and Routstr-backed paid execution.
- `stories/` - Collects and exposes plugin story definitions for sorted UI consumption.
- `system/` - Shared command, AI tool, parsing, rendering, representation, and demo-story contracts.
- `timeline/` - Persistence and retrieval for conversation timeline events.
- `tools/` - Utilities for extracting and validating JSON or JSONL tool output from model responses.
- `wallet/` - Local Cashu wallet persistence, deterministic operation support, mint normalization, state sync, and QR utilities.
- `web/` - Server-side local web UI support, including HTTP/WebSocket APIs, UI schemas, setup, push, previews, and TTS endpoints.
