---
direct_hash: eaa081bf2762b3a7c2b8a74a98267851633d88e27356a3d4a59c71960909027f
subtree_hash: 3eccbed956949daf9797eabc38e833d05c7e245f1cdde10d3fda43ad86d05025
files:
  utils.ts: 8299a99e0ead863ec5c21c38f8604fe49e26aa63fa8c80c0889c0adb5866f610
children:
---

# tools

## Purpose
Shared utilities for parsing AI tool output. Handles extraction of JSON from raw model responses (including code fences) and validates results against Zod schemas. Supports both single-object JSON and JSONL formats.

## Files
- `utils.ts` - Parses raw model output (JSON/JSONL) and validates with Zod schemas; exports ParseSettledResult types and parseToolCalls function

## Notes
- Caller receives settled results to handle partial success/failure
- No subdirectories
