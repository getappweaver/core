---
direct_hash: fdbbd960cce92cd8a138b1e25b8141b780270ecbb226d262a29e97d10af91933
subtree_hash: dcd9e936ab20d8c0729e7990f3074301613ff2afbbb670ab85a3045d9e6db32f
files:
  db.ts: 90e043f7a837ac1e8557ff55b06854f676432898ca38eeac5961073b349abcf4
  types.ts: 583d42e9d9ac6a8d6b1676942b3e22d860a3ae53d9c222445ea421bf1ca5f822
children:
---

# src/timeline

## Purpose
Stores and retrieves conversation events for timeline display, including chat messages, prompts, and command interactions.

## Files
- `db.ts` - Database table creation, event insertion/deletion, and paginated history queries for timeline events
- `types.ts` - Types for TimelineEventRecord, TimelineHistoryItem variants, command forms, and payload structures

## Notes
- Events are stored in timeline_events table keyed by timeline_id
- History items are derived from events via timelineEventToHistoryItem()
- Command forms track subcommand state and autoRun behavior
