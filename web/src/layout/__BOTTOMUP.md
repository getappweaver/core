---
direct_hash: 406b2df13846bc17cb5ef38929af9200c7e26edc527b51af0f342bb42bfb2580
subtree_hash: 9a5657564c5da9c619648d1e310b363dfade0340ec5082e5efb52586fbe186ca
enriched: true
enriched_version: 1
files:
  desktopLayoutPrefs.ts: 86131be36b3177fd6881c690180d09c147165293de982fb77fcca16da4e3e88f
  SingletonDock.tsx: e54802904d1e7319f0d64b6a8e28eda80f4a0a8e797e37c0d7b1b645ffed1016
  widgetIcons.ts: 24f85bf20feb45381147adedd64d6ab54dec548e86dae036257dcf8d21771583
children:
---

# web/src/layout

## Purpose
This directory contains desktop layout support for the web app, focused on widget dock preferences, dock rendering, and widget icon URL resolution. It exposes small typed helpers and a Solid component used by the surrounding workspace layout.

## Files
- `desktopLayoutPrefs.ts` - Defines desktop dock preference types, defaults, localStorage read/write helpers, and safe dock width clamping.
- `SingletonDock.tsx` - Renders the singleton widget dock, including taskbar buttons, docked timeline command cards, expansion controls, and resize handle.
- `widgetIcons.ts` - Resolves widget icon declarations into web asset URLs for builtin and plugin icon sources.

## Notes
- Dock layout preferences are persisted in localStorage under a stable key.
- Widget icon resolution distinguishes builtin assets from plugin-provided icons.
