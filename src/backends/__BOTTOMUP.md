---
direct_hash: bb47164f0ccfee762f87466f94151f94c9e6d6d0db9703e70feabe0b569c3b6b
subtree_hash: d9343ad669621c5294962b9444104579aad4240de893c3ad09b06e9901735311
files:
  agent-stream-chunk.ts: 8ad689cc04bdbd73d8f6c388ff3573a7707f9b24f86f2057de741bcb5bd9fb55
  cursor.ts: 164ebe9f9c6ab27227b5ae262e3f262ae67a5b80f6bbd9a0da911d4d67733316
  factory.ts: ac0d54d04b6aa7812edff578a729ca2e2f63c91d5bd40b8a4661576658dc592b
  opencode-common.ts: e6d175fdea50bbb612631468e1779ff4ffad3f7ade7567105994bae77e03b12e
  opencode-sdk.ts: f05a5f0a4b7eceea853f27222090f8c447dd7be85d7e53145ac6e141d8607465
  opencode.ts: a06a9c7978468f87d8f6b305744dc17027b315e02244ccfee80d3e9fafae8f4a
  types.ts: 230b949ca6fa43acbf6ec4579e03d223cfba0bb8162c2ed6a7c6f32408e64aab
children:
---

# backends

## Purpose
Agent backend implementations for different AI coding assistants. Provides cursor (CLI), opencode (CLI), and opencode-sdk (in-process) backends with a common interface for session creation and message execution.

## Files
- `agent-stream-chunk.ts` - Normalizes OpenCode SDK SSE events into AgentStreamChunk (text_delta, status, error). Filters noisy events, extracts session-scoped payloads.
- `cursor.ts` - Cursor backend using `agent` CLI. Creates sessions via `agent create-chat`, runs messages with model/workspace flags, returns merged stdout/stderr.
- `factory.ts` - Backend factory routing to cursor, opencode, or opencode-sdk based on AgentBackendName. Passes mode, model, provider, attachUrl to creators.
- `opencode-common.ts` - Shared helpers: reads model from opencode.json for mode, normalizes model prefix for provider (adds routstr/ when needed).
- `opencode-sdk.ts` - In-process OpenCode via @opencode-ai/sdk. Manages server lifecycle, port selection, SDK session/prompt calls, parses response parts.
- `opencode.ts` - OpenCode CLI backend. Spawns opencode binary, parses JSONL output into text/reasoning outputs, extracts tokens/cost from step_finish events.
- `types.ts` - Core types: AgentRunResult (success/error), OutputSegment (text/reasoning), RunMessageProps, AgentBackend interface definition.

## Notes
- All backends implement AgentBackend interface with createSession, runMessage, availableModels
- opencode-common.ts shared by both opencode backends for model config reading and provider normalization
- agent-stream-chunk.ts normalizes SDK SSE events into unified chunk types for streaming
