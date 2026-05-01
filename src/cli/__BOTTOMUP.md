---
direct_hash: 59ff1a6e2ec4b2c71b7c46c2b77bd8b6134e348408a2359be9cc9e8e6bb259c6
subtree_hash: 8fba8fd214ba5b50942a131d33010b7a18b4e02e53b94bd86d1d3f11fffd84bf
files:
  local-cli.ts: cb72fdaf1ef29112b4f9463a9582dd202863e1ad053946ff2fcc1b7e04488e81
children:
---

# cli

## Purpose
Local terminal chat interface using readline. Accepts user input and processes messages asynchronously with special handling to prevent deadlocks when plugins await prompt input.

## Files
- `local-cli.ts` - Readline-based terminal chat; processes user input async with pending-prompt resolution to prevent handler deadlocks

## Notes
- Supports !help command
- Chains message processing to avoid concurrent handling
- resolvePendingPromptFirst skips queue to prevent CLI deadlocks
