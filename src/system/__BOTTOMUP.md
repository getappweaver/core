---
direct_hash: ee51e0ddbf1d82b43083d0294e8b434a07f922bd9d924d0fc2b0d156fd51664c
subtree_hash: c78d737f88b0b0d9297ccecdb84c16be6ce5a4a9ea667775dd3415d0dc6ef3b4
files:
  ai-definition.ts: 54b858af756be1c5c4f03fdfcbe2ce6b7047268998387d529af11bd70ffcdd44
  command-definition.ts: 7e8e410fea38987222827ae66714ec9b2f6a4518734a09137c78291037693e45
  command-helpers.ts: 55e41fe00ba96e69212fa3aea413a2ab572ac03c1b68d9d3369e6afb4cb4b5ae
  parser-cli.ts: 30eabb50bc3e62fad7b682e4099c8aa21727f1c3039cab77d15a2a1b7e45bf6d
  render-context.ts: 5d12b1ddfc8c798ffa13e243c3bdbe5bfc3ac27e1c913376cb5e932094a09481
  representation.ts: b67184a1d09aa2b5a65661a46be1ea90b40c774f00e18839c550d2e393b974b2
  story-definition.ts: 86b639e486c67531ad24e152114d08055aab95b8fb00146eb1990a0bb49bb717
children:
---

# src/system

## Purpose
Defines shared system contracts for AppWeaver commands, AI tools, parsing, rendering, representations, and demo stories. This directory is mostly type/schema infrastructure used by plugins and command execution layers.

## Files
- `ai-definition.ts` - Defines the AI tool contract, including schema, database opening, execution context, agent instructions, notes, rules, and demo stories.
- `command-definition.ts` - Defines command, subcommand, argument, option, and web widget metadata plus name-matching helpers.
- `command-helpers.ts` - Provides typed command/subcommand specs, renderer selection, adapter handling, and subcommand execution helpers.
- `parser-cli.ts` - Parses both tokenized CLI input and structured web-style input into validated command invocations.
- `render-context.ts` - Defines minimal text and web render contexts carrying the active command prefix.
- `representation.ts` - Defines the shared versioned representation envelope and helper for extending it with plugin data schemas.
- `story-definition.ts` - Defines typed demo story flows for command and AI showcases, including steps, actions, targets, sandbox state, and outputs.

## Notes
- Command metadata requires explicit definitions for CLI, web catalog, and parser behavior.
- Structured and tokenized CLI inputs normalize into the same parsed invocation schema.
- Representations use a common versioned envelope that plugins extend with their own data schema.
