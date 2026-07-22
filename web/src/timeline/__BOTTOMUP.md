---
direct_hash: bd8dd4f3ba4767a68786c0ba4719a4b9bc0a681dcc416c29ca5b03eefb0a8335
subtree_hash: 7693d8cc3b58cd25d12eaadb02a8262f0713999dea484b1c47815dfdf1a0913f
files:
  types.ts: 694670b85651c27bd4b3156be77827332a31e67d7e2aaa2055841a6dec4dabd9
  useTimeline.ts: 7e74f72ca26c232273504cdf0d5b947667b2f020fa24737d37d38a2023137734
children:
---

# web/src/timeline

## Purpose
The timeline folder contains the Solid-side state adapter contract and hook for editing, deleting, saving, rerunning, and submitting timeline items. It centralizes timeline mutations and socket persistence actions used by the web UI.

## Files
- `types.ts` - Defines the adapter inputs and hook methods used by timeline state management.
- `useTimeline.ts` - Implements timeline actions for system messages, form persistence, item deletion, web result replacement, form submission, and reruns.

## Notes
- Socket-backed mutations create pending request IDs and report local failures as system messages.
