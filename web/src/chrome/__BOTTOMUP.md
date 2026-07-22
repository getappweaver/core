---
direct_hash: 64725e065f98974783814e178d08c61e55ae1dd8298285d888f9680b70ad548d
subtree_hash: b5acb82253a8652e1db786873a866390834cec0d321f39e6b713fb4d848790e7
enriched: true
enriched_version: 1
files:
  ChromeOverlay.tsx: 64c65de006d9c568b5ef310d1dfebb23949b860d2bf0a376a33c03e959d5d931
  HeaderChrome.tsx: 431bcd7ebdfe737c93b12050d96515b51aa5d14506c8134ac12cf962efa1eab6
  types.ts: 75bfcef8adfc1559cd01f3a0141fd3e194975541cb721a5c0ac7fc27a56bd34f
  useChrome.ts: 4cb6d57e08be94797facf0cdec9f702ec5f3691576cc71bff3769e9c57a41da5
children:
---

# web/src/chrome

## Purpose
Chrome contains the Solid UI pieces for AppWeaver’s topbar widgets and chrome-scoped modal overlay. It owns header widget rendering, account/menu actions, and transient chrome modal state used by web command output and prompt overlays.

## Files
- `ChromeOverlay.tsx` - Renders the active chrome modal, including command output, shadow-root web content, and prompt reply overlays.
- `HeaderChrome.tsx` - Renders the compact topbar, widget buttons, account menu, Nostr/settings submenus, and restart/connect actions.
- `types.ts` - Defines the chrome modal, prompt session, and hook state contract shared by chrome components.
- `useChrome.ts` - Creates the Solid signals backing chrome modal content, loading/error state, web output, and prompt sessions.

## Notes
- Chrome web actions are tagged with dedicated source IDs so they do not record into the main timeline.
- Widget icons resolve to built-in or plugin asset URLs before rendering.
