---
direct_hash: 9e4bab5406cf1510965b491d8581981ef36a128d301196642ebc94b673e0310e
subtree_hash: 3295259b4cf5cbbdbb3a367f1f65162a46f4743f1e9cd833eb0305f16b986be5
files:
  agent-stream-chunk.ts: 60e68345a78182c2bb6cec09a989847dab681096b2481b13d07b16330d885315
  cursor-sdk-worker.mjs: 24bb853f2767e65f68cbaf81e90956151984553ac990368efe52252fbb74f7c4
  cursor-sdk.ts: d2110836950f85d462860e516eda42d20e272286b958a2709882a26513a4060e
  factory.ts: d069baaedfc17f72db61afb9bb47b5d44160a817dbe13be09ebbb4bffb3d8a50
  opencode-common.ts: 77ce85fe22fff7a1c0fa1917276ee3272483ffc1ffb7775ca4f4b5598e761be3
  opencode-config.ts: a822f15b149f716ee5c8eed731283b82f3d2c1c53185da4afa2ce8221ef87592
  opencode-parts.ts: 43e1233199003f153390b5b973f40693fbe8482dc0d3120b5328141a4b93c1a1
  opencode-runtime-context.ts: 3f389528db12801590bd88d0efd3a5f7e38e599b424e0f5af4864942e95b599f
  opencode-sdk.ts: 2b44aa677c9e5308a043056e6fd3da6a9f13fa7c492bb9fddde3ba4f3e6c0be2
  stream-debug.ts: e6cee504db78879285828d71381112de3149f72ec6ee34f47ff15529683121e8
  types.ts: 45196c58e12445c301c1f99f9cea140a33cc884e0d2d23a72a4da659288d1f24
children:
---

# src/backends

## Purpose
Backend implementations and shared contracts for running AI agent sessions. This directory adapts Cursor and OpenCode SDKs into a common session/run/model interface with normalized streaming output.

## Files
- `agent-stream-chunk.ts` - Defines normalized stream chunk types and maps OpenCode SSE events into text, reasoning, tool, diff, status, summary, and error chunks.
- `cursor-sdk-worker.mjs` - Node worker that talks to @cursor/sdk for session creation, message runs, model listing, and line-delimited streaming output.
- `cursor-sdk.ts` - Cursor backend adapter that spawns the worker, streams text deltas, caches model listings, and implements AgentBackend.
- `factory.ts` - Selects and constructs the configured backend implementation from backend name and runtime settings.
- `opencode-common.ts` - Shared OpenCode model resolution helpers for config fallback and provider-specific model normalization.
- `opencode-config.ts` - Reads, summarizes, edits, caches, and persists OpenCode root model and agent markdown configuration.
- `opencode-parts.ts` - Parses OpenCode message parts into internal segments and converts text/reasoning segments into final outputs.
- `opencode-runtime-context.ts` - Builds the runtime context prefix injected into OpenCode prompts for AppWeaver chat sessions.
- `opencode-sdk.ts` - OpenCode backend adapter that manages the local SDK server, sessions, streaming runs, auth setup, context stats, summarization, and model listing.
- `stream-debug.ts` - Collects and logs lightweight stream timing and chunk-size metrics for backend runs.
- `types.ts` - Defines the shared AgentBackend interface, run result shapes, output segments, and output extraction helpers.

## Notes
- OpenCode streaming is normalized through agent-stream-chunk.ts and opencode-parts.ts before reaching callers.
- OpenCode config helpers read and write both opencode.json and .opencode/agents markdown files.
