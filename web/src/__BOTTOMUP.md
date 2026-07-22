---
direct_hash: b69f3e1ff13dede5eeee003ca47cb5fb659f8869fa3967f153a5c0987d6d52fe
subtree_hash: 4ac1fbb50bb885341d1c97ad806b1209be15122952764f9018a519ee5fca940b
files:
  App.tsx: 48d31246700e3ffc973757560a8120e3ade711dff94d10d760873a46675f27a2
  editableTextRegistry.ts: 5e12288bc1c621e0b9bf5443efcad00093991592a59ead0234c71f2a35128f4a
  main.tsx: 54f41c34d7d06f0524900eb07542fae5fdc68d995e9e3d12292a284ed67e5044
  register-web-push.ts: 22c6b7f0d7108198157d675aa7b4baa574974379050c8dc29d84ec4def17ae38
  restartStatus.ts: e95c459f21bc4c7e9b2a923f27ddefb379df695315ecf79fe8b73599d569c57c
  styles.css: 253b4fda5fdbd4145130acab9bfe0ea87a9d8ba1e1cdc77909ee39e9f90f9cc7
  sw.ts: 271fe956014955164503b27f1e749aab8531eccf28975c7ec4804576c8ab0466
  types.ts: e66c85e1e69ac5f03afe4f3a0aebf1f6ae6d5f1b2a5be5be98e3e04c9789c3bc
  utils.ts: fd9053a1e250a925fb3300ceaae56d71a815e4fc7e7a94899e49eaa1902f9bc2
  vite-env.d.ts: 813cea96ad74166e43d9684d2030441e0ee6ff167c93f4b5a4a9b79d0bf225c7
  ws-types.ts: 2cfb26a35d3355e3b821c80fb3e323d154cbd003e6ba9eceb3de2db2f1256e51
children:
---

# web/src

## Purpose
Solid/Vite web client root for AppWeaver. It wires the main app shell, service worker, global styling, shared browser types, HTTP helpers, and WebSocket message contracts while delegating feature areas to child directories.

## Files
- `App.tsx` - Main Solid app component that composes auth, setup routing, WebSocket-backed commands/chat, timeline, header chrome, dock widgets, demo stories, and composer controls.
- `editableTextRegistry.ts` - Registry and DOM fallback for retrieving editable text snapshots, including active line detection across shadow roots.
- `main.tsx` - Vite entrypoint that registers the PWA service worker, installs optional debug hooks, and renders App into #root.
- `register-web-push.ts` - Browser Web Push subscription helper that fetches VAPID config, manages service worker subscriptions, and persists subscriptions through API calls.
- `restartStatus.ts` - LocalStorage-backed status helper for showing plugin-install restart and success messages across reloads.
- `styles.css` - Global app stylesheet defining layout, modals, palette, timeline, forms, composer, dock, setup, and shared retro UI primitives.
- `sw.ts` - Workbox service worker that precaches assets, keeps API requests network-only, and handles push notifications and notification clicks.
- `types.ts` - Shared web-client type definitions for command metadata, widgets, OpenCode agent editor payloads, command outputs, and timeline item unions.
- `utils.ts` - Shared browser utilities for command payload construction, palette matching/scoring, auth-aware JSON/blob HTTP calls, and chat API submission.
- `vite-env.d.ts` - Vite and PWA type references plus AppWeaver demo environment variable typings.
- `ws-types.ts` - Typed WebSocket server message contract for command results, prompts, chat streams, timeline history, composer AI state, completion, and errors.

## Notes
- App.tsx is the central composition point for auth, sockets, commands, timeline, chrome widgets, dock layout, demo stories, and composer state.
- styles.css defines the app-wide compact retro terminal visual language; shadow-root WebNode styling is delegated to webview.
- Shared TypeScript contracts here mirror server command, timeline, WebNode, push, and socket payloads used across feature folders.
