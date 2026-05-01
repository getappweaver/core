---
direct_hash: 0f8b7737aa56ba592e1af3d8cccfa2711c8bda7b156769baf212c3da3dac5e3a
subtree_hash: 84c37c1f069552de017ae8a89c51d8f33edf957703465af3fb950bbe44b26c17
files:
  with-status.ts: 6784ddac3e1edcaa397176adb993fad4f2edb04a845adb137fc148d90306d01d
children:
---

# commands/shared

## Purpose
Shared utilities for appending bot status blocks to command responses. Provides helper to extract status-related props from routing context and a function to render and attach status text.

## Files
- `with-status.ts` - Exports statusPropsFromContext and appendStatusBlock for rendering bot status after command output

## Notes
- Only exports two functions for status block composition
- Depends on bot/status modules for representation and text rendering
