---
direct_hash: f9d8b733c107b12dc74b556f62b13f6d7a607ac8687dee84ff23e32510684acd
subtree_hash: ccae3db9fdf4d4427f07b5954df9818af7174f1510fb479d99a47582e8c61267
files:
  chat.ts: 824b1f7f2d98696b697c00f32e8743ad004fbc3300edeba216988a2b88b3c519
  command-catalog.ts: c6f8e15028ac35799f04b395010dbc33abe8073064496c4747a7f198ee92b511
  composer-ai-state.ts: 3447dd3dbd652ffdab0ef85e8e9732a62dca6cc4b387a7043963c03662ed5d4c
  execute.ts: c0f01996f468ef3ca4512943875670c2cece3b314d1e4ecd02e579a44e281fd9
  link-preview.ts: 446a1114ef0156af44502b1fe535bda17836df48b245db81a2166508dda72fbe
  native-tts.ts: 0bdb35f22b22bb1a2279034e288fc4021fc3181890d4b8e4af695efbb66c60a0
  nip98-verify.ts: 8a1330252ac604ef4433c8bd797a563d39ecdfa6328bd829f3c84147e9106f95
  nostr-resolution-schema.test.ts: 3402cf8d9257292de55c545c69567d7226df15bd38d62aef371e70dcae948891
  nostr-resolution-schema.ts: e9001603870ba9a79e8b192d29c1a535a6b33c1c1d552456476a36fa4820f024
  nostr-share.ts: 985a91753979b0a2795254de6ebaa611a4acd4baa1de27b515b807cc0c09b2aa
  publish-widget-icons.ts: 65ed7fba5219fc8b1ff27b0c9ba8e5381ed49e52535ad140ce4fd333d71c942e
  push-schema.ts: 7878a113e324504a6487e783d9bb612fd0f22ce05c57af17b1c7b2060e1b10a5
  push-send.ts: 28d97a4b51cb4575c7e277508810d17f62f087121867d16979a22de306a29d01
  push-subscriptions.ts: c9b9f9c9465b8f2fa425071e9796a03597bb060605b5647f22de0919b31bb3af
  routes.test.ts: a0f9304e13d8fde902a42ff85747159ead70f5bc85c420d0d3a83e111bff3c44
  routes.ts: b6fd5317e9188ad3917152b83306242362cad2fd39ac6b4f556a5ff9c50b30f1
  server.ts: 8f5c9ef643bace7af2d5717db9775d0275b0dd6add9affafcd3536b16c982a52
  shell.html: b3b4ba2ecaa3a09bc93b23c83c7c282e4ff79d5e94222c7459bb2c9080e78a59
  ui-schema.ts: ecd0608184b3efa7495fdb028c874942a073fc1a44400239c41554fc4cfb83c5
  web-dist.ts: 8cfc0d45cebcd40084678b839066c65e5fa277425e34d69f4379bb3a3a3d755b
  widget-icon-path.test.ts: 9236f42713a4556c524915c64140c80d29e97b60bd2de2cb1b7a68b7ee544633
  widget-icon-path.ts: 43b6a7d1c64a1c1485d9fad0cad308b470b91979dd4195770f70a44b8de004e6
  widgets.ts: 6baf30615f756460fda0786e2abcfb3b989652f6d93412a8caa78e57bc8521a2
  ws-prompt-session.ts: ca5ac740a506b1da2b0938632f118dfdd4cf1206b0b4c8caee81342450bcf732
  ws-schema.ts: 51c9af862ab4266e8c48b61768e2b60854fb76383a877da71e160f3ee3ad7b52
  ws.ts: 4c43507324ec0e946c33c83ceab200a4bb4f1f4317a9a9b99c9943ce268ddecc
children:
---

# src/web

## Purpose
Local web server layer for AppWeaver’s HTTP API, WebSocket UI protocol, command discovery/execution, and typed widget wire format. It also provides Nostr resolution endpoints, push subscriptions, TTS, setup routes, and production web asset serving.

## Files
- `chat.ts` - Runs web chat messages through the configured agent backend and session.
- `command-catalog.ts` - Builds web-facing metadata and lookup helpers for built-in and plugin commands.
- `composer-ai-state.ts` - Assembles current backend, model, session, and context-window state for the composer.
- `execute.ts` - Converts web command payloads into routed command invocations.
- `link-preview.ts` - Fetches and extracts Open Graph or oEmbed metadata for link previews.
- `native-tts.ts` - Validates and invokes a locally configured Piper binary to synthesize WAV audio.
- `nip98-verify.ts` - Verifies NIP-98 authorization events against request details and the master pubkey.
- `nostr-resolution-schema.test.ts` - Covers normalization and serialization constraints for Nostr resolution transport schemas.
- `nostr-resolution-schema.ts` - Defines bounded Zod request and response schemas for Nostr resolution API endpoints.
- `nostr-share.ts` - Builds client URL-opening actions for Nostr event and profile shares.
- `publish-widget-icons.ts` - Copies declared built-in and plugin widget icons into web public assets.
- `push-schema.ts` - Defines request-body schemas for Web Push subscription management.
- `push-send.ts` - Sends VAPID notifications to stored subscriptions and removes stale endpoints.
- `push-subscriptions.ts` - Creates and manages persisted Web Push subscription records.
- `routes.test.ts` - Exercises authenticated Nostr resolution HTTP routes with an injected fake service.
- `routes.ts` - Implements local HTTP routes for setup, APIs, commands, Nostr data, push, TTS, and static UI delivery.
- `server.ts` - Bootstraps the localhost Bun server, wiring HTTP and WebSocket handlers.
- `shell.html` - Legacy standalone command-discovery and execution interface served as a fallback shell.
- `ui-schema.ts` - Defines the validated generic web UI tree, actions, widgets, and command result wire formats.
- `web-dist.ts` - Safely serves the built Vite SPA and static assets with SPA fallback routing.
- `widget-icon-path.test.ts` - Verifies normalization and publishing paths for plugin widget icons.
- `widget-icon-path.ts` - Normalizes local widget icon references and maps them to public asset paths.
- `widgets.ts` - Provides compact helpers for composing common WebNode prompt and review widgets.
- `ws-prompt-session.ts` - Tracks interactive command prompts and resolves browser-supplied answers.
- `ws-schema.ts` - Defines WebSocket client/server message schemas, types, and message constructors.
- `ws.ts` - Handles authenticated WebSocket commands, chat streaming, prompts, demo mode, and timeline persistence.

## Notes
- HTTP and WebSocket routes share WebRouteContext and NIP-98 authorization.
- WebNodeRoot is the generic UI payload consumed by the separate web client.
