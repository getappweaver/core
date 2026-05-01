---
direct_hash: 012edf2cd9409652bd70b89e05247dfdbdd81d20e13c968a04635aa643ea5a93
subtree_hash: 754c4baab8fe7cce6875a2690ba1d9d38dd8e35509da09162703e5e3a535551d
files:
  command-definition.ts: 180c24ddc9d863c177190a4fb5c4e9690bca94098b6095df01e21916ce83ba44
  command-helpers.ts: 55e41fe00ba96e69212fa3aea413a2ab572ac03c1b68d9d3369e6afb4cb4b5ae
  parser-cli.ts: ad2259d488c2ae4aa12180f53c2089c78a630a73838406fc2f65551d0f51a207
  render-context.ts: 5d12b1ddfc8c798ffa13e243c3bdbe5bfc3ac27e1c913376cb5e932094a09481
  representation.ts: b67184a1d09aa2b5a65661a46be1ea90b40c774f00e18839c550d2e393b974b2
children:
---

# system

## Purpose
Command/subcommand infrastructure for CLI and web. Defines types, parses CLI input, and orchestrates subcommand execution with a handler-to-representation-to-renderer pipeline.

## Files
- `command-definition.ts` - Type definitions for commands, subcommands, arguments, options; helper functions for matching and lookup
- `command-helpers.ts` - Types and utilities for building subcommand specs (adapter, handler, renderers) and executing them
- `parser-cli.ts` - CLI input parser that tokenizes and validates against command/subcommand definitions using Zod schemas
- `render-context.ts` - Stub types for text and web render contexts (just prefix fields)
- `representation.ts` - Zod schemas for handler response wrapper with kind, version, meta, and extensible data fields

## Notes
- All subcommand specs follow definition → adapter → handler → representation → renderer pattern
- Parser only handles CLI input; web parsing likely elsewhere
- Representation schema provides base envelope for handler results
