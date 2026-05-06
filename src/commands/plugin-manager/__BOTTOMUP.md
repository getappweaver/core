---
direct_hash: f123d46045efb293d3575342e8f14b7fc514d4d7e00fe48c75e289df4f91a332
subtree_hash: 924f7e8ad86a8cf41311843312758de790be2827442964930d789d91915dae9d
files:
  definition.ts: b8d389935241d4538a240cb28fa5eaef2c3a4a2b37debafa5b84cc3e3eabf855
  handler.ts: a6b8d618a3441915fc02727267f6e7906525ab07713bccf1582d5ab42fee7d8b
children:
---

# plugin-manager

## Purpose
Provides the plugins/plugin built-in command definition and handling. Dispatches to install and help subcommands.

## Files
- `definition.ts` - Defines the plugins command with help and install subcommands, exports getPluginsCommandDefinition.
- `handler.ts` - Dispatches plugins command requests, exports handlePluginsRoot BuiltinHandler.

## Notes
- Command aliases include 'plugin'.
- Install is the primary functional subcommand.
- Help subcommand uses built-in help text rendering.
