---
direct_hash: f9e93c9cfcd49b2d8c34e733185206e767297236663ecf75efbcda2442803413
subtree_hash: 566ad68336766a46dd496fb94f8ba64970d334f09e0d571b0ceb83333c679e1e
files:
  commentIssue.ts: e1d49010527bbf2fbb8ca008024ee2912e0e1bac8b9165b09e757ea050c46269
  createIssue.ts: 834ab54a0d8af642021e46ca6bea5b99de3c43878fa6b229480491cdf045ad90
  createWorkflow.ts: 1dc3bdcdf919951d90444523d2682284f1edd4616bcde158c29dd3356ef4c0b2
  lightningZap.ts: d6e2ddc3f625eaa5c2c0fcbdde5ccdca162445b26453d72a84eecc5f9bac71cc
  markIssue.ts: 4366655549233b6a0772861a1f591c9f7667440b150939b6c1e46dd3d0246d68
children:
---

# web/src/roadmap

## Purpose
Client-side roadmap action handlers for the web app. These files validate WebAction payloads, sign and publish Nostr roadmap events, update chrome UI state, and append system feedback for issue, board, status, tracking, comment, and Lightning zap flows.

## Files
- `commentIssue.ts` - Handles publishing NIP-22-style comments on roadmap issues and reports the published event in chrome UI.
- `createIssue.ts` - Handles creating NIP-34 roadmap issue events for a repository, including signer prompts and relay publishing.
- `createWorkflow.ts` - Handles creating roadmap workflow boards and fetching repository announcements needed to prefill the new-board UI.
- `lightningZap.ts` - Handles funding roadmap issues via Nostr zaps, including issue/profile lookup, LNURL invoice creation, WebLN payment, and QR fallback.
- `markIssue.ts` - Handles issue status marks, deletion requests, and board column tracking events, with permission checks and optional modal rerendering.

## Notes
- Actions use zod schemas at the boundary before signing or publishing.
- Most handlers publish through nostr-tools SimplePool and render compact WebNodeRoot status views.
- Signer restrictions enforce NIP-34 repo ownership, issue authorship, or board ownership where needed.
