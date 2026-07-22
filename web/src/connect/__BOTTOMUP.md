---
direct_hash: d593a4f7b373a991ef61f32862d19ca78f67a85926339a64861de2aa5bdc1c4a
subtree_hash: 62a063cdc9705bef4715bfdf6e1d301b47b3bb6141b6f13e09924e2d9b2371bf
files:
  ConnectOverlays.tsx: 18c4e5a733c9ed4e0296949517d11e4af460b4a2dd2528d1f93e36fff83dbccf
  types.ts: 634a9a55eef7030d882803d0d055c4e51d01a7d8b902ee1ff02686cccfd11ef8
  useConnect.ts: b2e37030bd8ab4fe4a27d48aae62e3a885d47d26f59b0bcc96ab87d090093fdb
children:
---

# web/src/connect

## Purpose
This directory contains the Solid hook and overlay wiring for the web app’s Nostr connection UI. It translates auth state into connect/unlock modal visibility, labels, and menu behavior.

## Files
- `ConnectOverlays.tsx` - Renders connect and unlock modals from a ConnectHook and auth context.
- `types.ts` - Defines the connect adapter, hook contract, and auth-state alias used by this directory.
- `useConnect.ts` - Implements connection UI state and labels from the Nostr auth context.

## Notes
- Local API centers on the ConnectHook shape from types.ts.
- Unlock modal suppression is managed in useConnect after the user closes it.
