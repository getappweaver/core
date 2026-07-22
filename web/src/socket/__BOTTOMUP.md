---
direct_hash: 124ff4d91d03ea8ef358faadfda9849698a301d3738a6ecaf7b587871e646822
subtree_hash: df13b39d4556c84c17624625751e7e1e16eb2e4fb27a4c498bee863f6446cac2
enriched: true
enriched_version: 1
files:
  dispatch.ts: 553036489e5751f87c7017b81ef4f4dc212611be6d9d6a2767439f18982dbd3c
  transport.ts: b4f41f889fc0bf0fbb0979fb3cac9a5baee81f2ad0e99dec675d5878e58af09b
  types.ts: 8f555dd2c1e6f6ae7c8672cc7382650cf6aaafe075d19bb284d6ef8e976e66e7
  useSocket.ts: 8b449a41c2ad122c809bac52f989eaa523dc370efa08a0ca27fc35af183351ad
children:
---

# web/src/socket

## Purpose
Socket client layer for the web app. It owns WebSocket transport, request/response dispatch, pending request callbacks, bootstrap loading, reconnect state, and demo-mode message emulation.

## Files
- `dispatch.ts` - Normalizes prompt/command outputs and routes incoming server messages to pending callbacks or chat stream handlers.
- `transport.ts` - Small WebSocket transport wrapper for URL creation, guarded sending, reconnect timer clearing, and base connection lifecycle handlers.
- `types.ts` - Shared socket contracts for pending requests, server message unions, app adapters, transport state, and handler groups.
- `useSocket.ts` - Solid hook that manages socket lifecycle, authentication bootstrap, reconnects, busy state, request registration, and demo-mode command responses.

## Notes
- Server messages are routed by requestId through PendingRequest callbacks.
- Demo mode mirrors socket responses from fixture JSON and story sandbox handlers.
