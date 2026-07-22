---
direct_hash: c3251d37766c8e30848dd56faccee2ea4f09aa7d72b80c37448e437fa6a2d4d6
subtree_hash: 1ab1b4c074133657d2d9e290883843ba8a9251afe71b03c35d7e0fe67eb3fd98
enriched: true
enriched_version: 1
files:
  contexts.ts: 788daf0257b88cf0ddb3d2ef63868893503788dbf656adfe29aea87dd8d33e3e
  element-helpers.ts: ed6ddf04a126fc66f1bb9beaa86ff59814500c246a5cced0f5a0e3fd79c1fc26
  overflow-menu.tsx: 7574cda72e47865bbc99526515973bc6399e40176185617d25d8e0d65e978b0e
  reconcile.ts: cfe09e53bb0d550e7850ba551841006d0abf0effa7b9399bfe5c2ea20ad163da
  speech.tsx: bf8ed9d99e62161a8eac713314cf2945bbff7e22936dc947c30f1d89f083db91
  tree-filter.ts: 0a8056ec504921e486c37ee3e29c754f842f9fa394fcb97744671960943475c7
  tree-state.ts: 42b6ffef43731e87f3fd4086bfcfb7b619d2ca7a8957c308c750166bf8881cc5
  WebCheckboxControl.tsx: f7331a1c2f458dfd264c2bb8920344a1690201c3cf2787d9ff0f7894eda83e41
  WebCommandStatusElement.tsx: 76eadea893a414acc041cdc622964f2bb0c91a80dac07e68e3f0dacae3123569
  WebFormElement.tsx: e701e6997b42782bd968400af5ba36fb12a4bb64d63f61cfc8c4832be8683288
  WebNostrPostElement.tsx: 6f5896fd01e50ac8cb25ddc85e0244e82607f02bf972845a452a93f5ae335e0d
  WebTabsElement.tsx: 9cae12034b984348e72ec8850b0cc07203ca02c08ad79b44cc121fe23111fa6a
  WebTreeElement.tsx: 1ca004842e7123606c28e34aecfca2b6b581a70d406ea7c5c3e8afaa59f2c3d7
children:
---

# web/src/components/web-node

## Purpose
SolidJS renderer building blocks for WebNode UI elements, including trees, forms, tabs, overflow menus, Nostr posts, and speech interaction. It also centralizes renderer context, local action handling, state reconciliation, and element styling conventions.

## Files
- `contexts.ts` - Defines renderer contexts, hooks, and shared props for WebNode rendering state and actions.
- `element-helpers.ts` - Maps element props to shared CSS classes, inline layout styles, and UI identifiers.
- `overflow-menu.tsx` - Renders action overflow menus with viewport-aware placement, checkbox triggers, and pending-state handling.
- `reconcile.ts` - Reconciles incoming WebNode roots into Solid store state while preserving compatible keyed nodes.
- `speech.tsx` - Provides element ref behavior, syntax highlighting, and sentence-level speech highlighting and interaction.
- `tree-filter.ts` - Builds and caches searchable tree indexes with text and glob query support.
- `tree-state.ts` - Stores scoped tree expansion state and resolves supported WebActions locally.
- `WebCheckboxControl.tsx` - Renders controlled checkbox inputs with indeterminate-state support.
- `WebCommandStatusElement.tsx` - Displays live background command state, progress, and output.
- `WebFormElement.tsx` - Renders WebNode forms and fields, merges submitted values into actions, and supports story-driven input.
- `WebNostrPostElement.tsx` - Renders interactive Nostr posts, embedded references, media previews, profiles, and post actions.
- `WebTabsElement.tsx` - Renders tab panels and maintains the selected tab locally.
- `WebTreeElement.tsx` - Renders expandable, filterable WebNode trees with lazy loading, bulk controls, and hoisted toolbar support.

## Notes
- Tree state is scoped and retained by render scope IDs.
- WebNode actions may be resolved locally before delegating to the command runner.
- Element presentation derives from shared WebElementNode props.
