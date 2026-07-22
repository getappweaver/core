---
direct_hash: 319ebb30a1bcc786cef58a243792cab99314f12993e31d91147c5be5860178a3
subtree_hash: c524e73007d3e66f29f09f16394b0b2ebc888b41f33d427262cb1b6f8577e52c
files:
  PaletteView.tsx: 2de9fd3e70c70b91f1108186df5ee2805abcce8e0b13e9f0c9a491dff5fd40ef
  types.ts: 84b3c9e4bf3c9519f38f13ebdd5abd4ab1505970fabff83e6d4920b4cdf95e55
  usePalette.ts: e870266d27b3b8fa6e17fe8fdd1f5ad0292be294a1fef2b0d4ea0aaf0eeffada
children:
---

# web/src/palette

## Purpose
Command palette UI and state for the web app. It exposes a Solid view plus a hook that filters commands/subcommands, handles keyboard navigation, and opens selected command flows through adapter callbacks.

## Files
- `PaletteView.tsx` - Solid component rendering the command palette modal, filter input, breadcrumb navigation, and command/subcommand result lists.
- `types.ts` - Shared PaletteAdapters and PaletteHook contracts connecting palette UI/state to command data and command-opening behavior.
- `usePalette.ts` - Solid hook managing palette state, filtering, selection, keyboard controls, command drill-down, and submit behavior.

## Notes
- Palette behavior is adapter-driven; command fetching, scoring, payload creation, and opening subcommands are supplied by callers.
- Special handling turns command help topics into selectable palette subcommands.
