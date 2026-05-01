---
direct_hash: f8772d4a8866b996547f7ec7584e5d0faad9989d82f01991667dc518372a630d
subtree_hash: 77e0d46f5e1d8e047018ba56e9b04ceeadd59e4061c243b186f55e25eebb3aeb
files:
  db.ts: bff16b7e5896e1b38849bf231d46cb321f21b5c6edc09302d65c0f0a8f8e7b3e
  types.ts: 70aa83a50656c1943188fbc5a454934f601a249d6c98981c64802d69187cb51f
children:
---

# timeline

## Purpose
Stores and retrieves conversation events for timeline display, including chat messages, prompts, and command interactions.

## Files
- `db.ts` - Database table creation, event insertion/deletion, and paginated history queries for timeline events
- `types.ts` - Types for TimelineEventRecord, TimelineHistoryItem variants, command forms, and payload structures

## Notes
- Events are stored in timeline_events table keyed by timeline_id
- History items are derived from events via timelineEventToHistoryItem()
- Command forms track subcommand state and autoRun behavior
