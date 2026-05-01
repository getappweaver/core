---
direct_hash: f3c9c39b45bad7c95fe5d74d92b99c9d8cb132c7b4b1c984f8245c3519b4eec6
subtree_hash: d1e427e6085afbf78a70e5e374927b7306e066c8f5cf1a94b96234cb62f05e40
files:
  chat.ts: 59a72e0f572c056a8d2227d0c9bf288ed73ea1618f790b4d70cc7bf62c8a8f58
  command-catalog.ts: 1515e711ea338318e9cb5b68bd1f06514c7c8fbebc2b5ff504c4dd3b6ff5cb80
  execute.ts: 9c3a819f7d20df584bfa472ffc7c6e1348d23b0d19c07d69db6a5a6aa278ce03
  nip98-verify.ts: 8a1330252ac604ef4433c8bd797a563d39ecdfa6328bd829f3c84147e9106f95
  push-schema.ts: 7878a113e324504a6487e783d9bb612fd0f22ce05c57af17b1c7b2060e1b10a5
  push-send.ts: 28d97a4b51cb4575c7e277508810d17f62f087121867d16979a22de306a29d01
  push-subscriptions.ts: c9b9f9c9465b8f2fa425071e9796a03597bb060605b5647f22de0919b31bb3af
  routes.ts: b5aea629fc1e5a680cbcb413fdd9029505b28ac83829757398fafefccadac2e4
  server.ts: 41a6af2bfd9408fd47729b925b4dfc0eca6c3bc8a57c32ca41b1863af02a94d9
  shell.html: 0ae06780adb55cb8881ba8fe3af9f9f1587c9cab010f57643d3008e1b3e91a14
  ui-schema.ts: b487753b2536948f50ce37280463ec9df0b6832646606af1ac23ac570ac2e95b
  web-dist.ts: 4e16b5b66b9e55259390d024288dbe73f48480aa6a365154286bce7442962bc0
  widgets.ts: 6480df5f25b98082e83473da3b388a929f4d0d833878b1ba50d68250d7ae0d15
  ws-prompt-session.ts: ca5ac740a506b1da2b0938632f118dfdd4cf1206b0b4c8caee81342450bcf732
  ws-schema.ts: c77f801f47929da85cf3203f2f2af9e12f619b524cdc9388fc273592fcaca02b
  ws.ts: 2de46baeb7e19caf25bb75d62001c3d38d19906d8c4a161f1175970973ecbc25
children:
---

# web

## Purpose
HTTP/WebSocket API for local bot discovery and command execution. Provides web UI shell (shell.html), JSON endpoints for chat/commands, and WebSocket /ws for real-time interactive sessions.

## Files
- `chat.ts` - HTTP POST /api/chat — runs AI message through backend with session, returns output + sessionId
- `command-catalog.ts` - Command metadata for HTTP/WS discovery; resolves by name/alias, serializes subcommands with usage, arguments, options
- `execute.ts` - Parse HTTP/WS payloads into CLI tokens and route via command dispatch; returns invocation + output or WebNodeRoot
- `nip98-verify.ts` - Verify NIP-98 (kind 27235) event: signature valid, pubkey matches, within 60s window, URL+method tags match request
- `push-schema.ts` - Zod schemas for Web Push subscription bodies: PushSubscriptionBody (endpoint, keys) and PushUnsubscribeBody (endpoint)
- `push-send.ts` - Notify all stored Web Push subscriptions via VAPID; removes stale (410/404) endpoints after send
- `push-subscriptions.ts` - Web Push subscription CRUD; upsert/delete/list rows in web_push_subscriptions table
- `routes.ts` - HTTP routing: health, commands list/detail, chat POST, command execute POST, push subscribe/unsubscribe, VAPID key
- `server.ts` - Bun.serve localhost HTTP; /ws upgrades to WebSocket, fetch delegates to routes; respects BOT_WEB_ENABLED/PORT/HOST env
- `shell.html` - Discovery UI SPA; lists commands, shows subcommand details with form fields, POSTs to /api/commands/*/execute
- `ui-schema.ts` - Zod schemas for web UI render tree: WebNode (text/element), WebElementTag, WebProps, WebAction, WebNodeRoot
- `web-dist.ts` - Serve Vite build from web/dist; returns file by path or index.html for SPA fallback; validates path safety
- `widgets.ts` - Helper builders for WebNodeRoot: textNode, textBlock, stack, row, multiChoiceQuestion, draftReviewPrompt
- `ws-prompt-session.ts` - Pending prompt state for WebSocket; maps requestId to resolver, tracks timelineId for insert decisions
- `ws-schema.ts` - Zod schemas for WebSocket messages: client (authenticate, run_command, chat, prompt_answer, load_timeline, etc.) and server variants
- `ws.ts` - WebSocket handler; parse messages, execute commands, stream chat, handle prompts, manage timeline CRUD

## Notes
- NIP-98 (kind 27235) auth required for /api/* endpoints
- WebSocket /ws upgrade requires Authorization header
- shell.html serves as SPA index when web/dist exists
