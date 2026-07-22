---
direct_hash: bdf03618461fc448c44f43201c4ed6002f6881764e6b746b458cc0926da50f8e
subtree_hash: 6be4a1d38284a460cdb2f74b1cddea64cc76502016ab84f605f9fdc87237e95d
files:
  local-cli.ts: 619c3ef9702b0596b4f352e16cdca09c3925e15a73ba6f9a4fec21b2ec44bfad
children:
---

# src/cli

## Purpose
Local terminal chat interface using readline. Accepts user input and processes messages asynchronously with special handling to prevent deadlocks when plugins await prompt input.

## Files
- `local-cli.ts` - Readline-based terminal chat; processes user input async with pending-prompt resolution to prevent handler deadlocks

## Notes
- Supports !help command
- Chains message processing to avoid concurrent handling
- resolvePendingPromptFirst skips queue to prevent CLI deadlocks
