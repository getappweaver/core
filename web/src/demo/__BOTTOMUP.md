---
direct_hash: 9624a4d6b0dca2181f6466683912966c05c456bf619c3ca87b9e9fedb404dd77
subtree_hash: 80b679fc6ff9211d68ffa1d0022172be88999bb18e065ee96e214ddb97c409b6
files:
  runtime.ts: 521b7340b5c50326e8b5c51e35af4d2ba87f952e051dc05aa573a162cec33c31
  scroll-debugger.ts: f77eb7bd6dbf4f0f35a64cb723a194caeeb2976c8cce73cdc3f391ee533fd945
children:
---

# web/src/demo

## Purpose
Demo-only browser runtime utilities for the web client. This directory exposes feature flags for demo mode and optional scroll instrumentation used while diagnosing embedded demo behavior.

## Files
- `runtime.ts` - Provides environment/query helpers for demo, embedded demo, and scroll-debug modes.
- `scroll-debugger.ts` - Installs a demo scroll debugger that wraps scroll, focus, and scroll-position APIs and logs captured calls.

## Notes
- Scroll debugging is gated by demo mode plus the debugScroll query parameter.
- Instrumentation mutates browser prototypes and installs a window global once.
