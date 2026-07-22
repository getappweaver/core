---
direct_hash: 39cc714edca15a5e583e248fddcc02f5ad7e822f67815e78dde5bcf26a3a9c14
subtree_hash: 55b13aa37065b1cc8b86161426f3d01e4966cecc71bd75a49ca9cf31d7e1087e
files:
  lifecycle.ts: 57102c814dc76e76db4c1faffdf476df2432674b80a58fae0a494ca6cc9dd9cc
children:
---

# web/src/debug

## Purpose
Browser-side lifecycle debugging utilities for the web app. The module enables opt-in logging of page visibility, navigation, unload, error, and service worker events for diagnosing reload or lifecycle issues.

## Files
- `lifecycle.ts` - Provides opt-in lifecycle event logging and service worker registration diagnostics for browser debugging.

## Notes
- Debugging is enabled via the debugLifecycle query param or persisted localStorage flag.
- Recent lifecycle logs are retained in localStorage for inspection.
