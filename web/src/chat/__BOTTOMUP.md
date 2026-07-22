---
direct_hash: 232c0a94ed4425bc97f2c0f787e7cd92c9253b001972674c81556b59193ce7c0
subtree_hash: 76644c99023585fec52458f73eb8243cf6b9fba35459a74fe76a3d68f4f09613
files:
  debug.ts: 3598bf9b2e004b9a14a31ff84014f44221d6e9a4f334a81cad116b477b5cec05
  types.ts: d88bc28a68ea3679c6f364bbc917ccc497219063852f27263af399f8372fec5f
  useChat.ts: 3679997b1bb63fbdd7b80a75e89504d8f7b88d3d6a7909e0bb7a4d150d321afe
children:
---

# web/src/chat

## Purpose
Chat state and streaming helpers for the web UI live here. The directory exposes a Solid-friendly chat hook, its adapter/interface types, and lightweight debug logging for chat events.

## Files
- `debug.ts` - Persists recent chat debug events to localStorage and mirrors them to the console.
- `types.ts` - Defines the adapter contract and hook surface used by the chat UI and socket response handlers.
- `useChat.ts` - Implements the chat hook that sends chat actions, tracks pending requests, and translates streamed agent output into timeline items.

## Notes
- Streaming text is buffered briefly before timeline updates.
- Structural stream chunks close any active text/reasoning segment.
