---
direct_hash: 8faebea6b306f220d8ada9ab08a61a49346d33632ca5b5bd0e2da0c6c42b4a1a
subtree_hash: fc2c2d7c720c4d08bae784e9171d98580684e89f105cfd28c541aa34766eb28b
files:
  debug.ts: 1055e0939d2f0c4586239d74cd0023367269971e80c482b2932aa4772f3caff3
  dom-targets.ts: 0e45d55c9ffbffbb068ce93c5350eaa6ee8d9155ab79792d5c6ba9a8190b7b21
  events.ts: f1f289f212046406d7a08eabeb35316766c20f7a367de6fb43564ee11d79150b
  open-widgets.ts: 78ab2acc9996dfb73fa0d5ddd9e434be1b53419ce4aeab02f480eace3978e5f2
  sandbox.ts: 32c3a22d2c6c0c8d52c6affe3351d007838da95bb5175406ca509cc14ee3f837
  StoryRuntimeView.tsx: 2fada062f61188600cd35e11206873801925e87ae01fc054a75f1720f7895eb5
  types.ts: 6d940181030e58a72f4086add50e99d41e011ee0a9469d99242a382b481c5312
  WalkthroughOverlay.tsx: 18dca54c582f3fe6ae00cc92c94772f1b0df3d6a62a7213f99835e033ab60fb2
children:
---

# web/src/story

## Purpose
Story runtime support for the web UI: it runs interactive walkthroughs and passive demos, tracks highlighted DOM targets, and coordinates story-related events. The directory exposes Solid components plus small state/event utilities used by the surrounding app to start, observe, and simulate stories.

## Files
- `debug.ts` - Enables opt-in story debug logging via query string and localStorage.
- `dom-targets.ts` - Registers and resolves visible DOM elements by story target id for overlays and scripted actions.
- `events.ts` - Defines the story event bus for walkthrough state, passive playback controls, target interactions, command completion, prompts, and widget lifecycle events.
- `open-widgets.ts` - Tracks currently open command widgets by command/subcommand so stories can react to already-open UI.
- `sandbox.ts` - Activates scripted story sandbox behavior that can answer websocket command and prompt flows from story payload data.
- `StoryRuntimeView.tsx` - Solid story runner that advances story steps, emits walkthrough or passive playback state, runs command actions, and shows the story card UI.
- `types.ts` - Shared story runtime payload, walkthrough, passive playback, diagnostic, and action-matching types.
- `WalkthroughOverlay.tsx` - Solid overlay that highlights the current story target, blocks surrounding UI, and presents walkthrough controls like Fill, Continue, Move panel, and Quit.

## Notes
- Communication is mostly window-level CustomEvent pairs with unsubscribe callbacks.
- Sandbox playback can intercept command and prompt websocket messages for scripted story data.
