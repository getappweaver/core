---
direct_hash: b8ddeb2f47000b45f53620ab380e34c7b6c223632d2314ad98cfa09ecb97f33f
subtree_hash: 66e8358547c246248af0915312331b1199e15ddf8c653d2a460e9541abc65684
files:
  representation.ts: ac3ed80f21b5cfd92fed706a4181035ce41c1d1b1b4630d13ec79c59a9808583
children:
  renderers: 34013f78af214ef41a07cc3fb70db5533640e9f0b4e1241ccd45ae9ecf0db809
---

# usage

## Purpose
Defines bunker.usage representation schema for CLI usage data.

## Files
- `representation.ts` - Defines BunkerUsageRepresentation schema extending createRepresentationSchema with kind bunker.usage

## Notes
- Uses @src/system/representation for base schema
- Extends with kind: bunker.usage and meta for bunker usage command

## Subdirectories
- `renderers/` - Renders CLI usage text for bunker commands
