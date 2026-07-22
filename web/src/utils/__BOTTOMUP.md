---
direct_hash: 450f94272add7c312ab2b50718909dbf68178cc11084ab6af598735b1218606a
subtree_hash: 321ef7c85ad8aa0a2fd2484fe624b7ba2293da0cef872e601ba889b481bb0ae1
enriched: true
enriched_version: 1
files:
  clipboard.ts: 85cd143222bebc7f77750507e98dfcd88d07af7298a19592372326535144b54a
  reconcile-store.ts: 3b49a8620e50d599d345c4c3cd045433d590933e17ba7b2c4242c87f713afad9
children:
---

# web/src/utils

## Purpose
Small web-client utilities for clipboard writes and keyed Solid store reconciliation.

## Files
- `clipboard.ts` - Copies text using the Clipboard API with a hidden-textarea fallback for older browsers.
- `reconcile-store.ts` - Produces a keyed array reconciliation that preserves existing Solid store record identities.
