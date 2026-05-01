---
direct_hash: 4b7e0381132e7e9ecdf58108efa66cb01444a9fe64b3f77b48159113dbb79fd0
subtree_hash: 1456a20abf6a47db5f6a888befef3b574e53f3914e0388265d0cf1faf39fbc92
files:
  build.ts: f67538fd33c8f91181e1fdca58ceb00f928fe33c2d58247bae40ff9f8eabdaf8
  command.ts: fda466186ca04a7f6f15abb9165c271dbedb5e35ced64d1cbc4a5d887c716c0d
  handlers.ts: 3a44ea2d56c4e2d63d83dbb4d0b22ca404c01e4149308eeaf755cc040893a515
  representation.ts: bd78d8b65cf2911a5d5f67f15002742566c5347c864a4acc6a2d0fb3d40d5a6a
children:
---

# commands/help

## Purpose
Help command implementation that builds and renders help text for both builtin commands and plugins. build.ts constructs help data from command definitions, command.ts creates the help subcommand, representation.ts defines schemas, and handlers.ts routes help requests.

## Files
- `build.ts` - Builds help data structures from command definitions (HelpArgument, HelpOption, HelpSubcommandDetail, etc.)
- `command.ts` - Creates help subcommand definition and builds subcommand representation for plugin help requests
- `handlers.ts` - Global help handler for root-level help and plugin help drill-down, lists builtins and plugins
- `representation.ts` - Zod schemas for help representation using the representation system (help data, subcommand detail)

## Notes
- Used by the global help handler to drill into both builtin and plugin help
- Handles help for builtins (help, session, bot, ai, wallet, bunker, wot) and plugins
