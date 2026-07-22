---
direct_hash: 89d1c7399d72b5a6d6236ec5e37bab99d4401f9a21a049b853ebf79d3bc3cac8
subtree_hash: 2b71bd8f3dca718f626f0af7d9d2b0956444562525aa90ff55f22a21888ad1f7
files:
  registry.ts: 48f0d11fbcf92e98e4d708365b86ea77767aaf4dc62b1db53cbdd2d62d844fd6
children:
---

# src/stories

## Purpose
Story registration utilities collect story definitions exposed by registered plugins and make them available to callers in a stable, sorted form. The directory currently provides lookup/listing behavior plus icon URL normalization for story UI metadata.

## Files
- `registry.ts` - Builds RegisteredStory records from plugin stories, resolves widget icon fallbacks from command definitions, and exports listStories/getStory for consumers.

## Notes
- Local story IDs come from plugin-provided StoryDefinition objects.
- Relative plugin icons are published under /plugin-icons with path separators flattened.
