---
direct_hash: aaa3299ed462fbf9c4e87e53cc35159175868c9e2631252e480336ce23bd39b2
subtree_hash: c9276f1c9d9df714ede3f9d5696a4b79989a88dae6cc997bb2284d47e4d451ab
files:
  buildModelOverrideMenuWebActions.ts: 0d35f7c690759bb41e01aeee522010d5253c8bd7887c54fca8a77f7953f5544d
  types.ts: 484de9bbd2d2e7640b23d5cdd9c0157cb8ccf76ba6a05d16e4367b15b151352a
  useComposer.ts: a8de2962654bd9cb0127eca77da5a009895583c97a6878143d7a82955585b32a
children:
---

# web/src/composer

## Purpose
The composer folder contains the Solid chat composer hook and small supporting types/actions. It routes typed input to chat, prompt answers, command palette flows, or command subcommand execution.

## Files
- `buildModelOverrideMenuWebActions.ts` - Builds reusable WebAction objects for setting/changing or clearing the AI model override from composer AI state.
- `types.ts` - Defines the composer adapter contract, chrome prompt session shape, and hook interface used by the composer implementation.
- `useComposer.ts` - Implements composer submission routing and focus management for chat input, prompt answers, slash commands, and palette opening.

## Notes
- Slash input is interpreted locally before chat submission.
- Composer behavior is adapter-driven so callers provide chat, chrome prompt, palette, and command integrations.
