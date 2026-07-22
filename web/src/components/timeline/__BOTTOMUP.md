---
direct_hash: 81564739c204d85520a14aaeb7af2c26d25e859138ddc2e37e5bee399d8dba99
subtree_hash: a2ef3167071cc5bd563a14e710c8c13d50a1221be2e189647040e1f49638d181
enriched: true
enriched_version: 1
files:
  attachTimelineTreeHeaderInViewEffect.ts: e1b04556ee3b0b8c89ce31c3b51339ad63e8b6b4f19b32d74508248cf93fa0ba
  timelineCardHeadIcons.tsx: 46e939714fdb25e52f8e3497713b754d16e2117e3ab7f1f3e5dce9344d87dd1b
  TimelineCollapsibleCard.tsx: 7736d8e3494a47e81965597562d93767f7602c76291dc4f5f76de5f498aed1c1
  TimelineCommandResultCard.tsx: f532d9703517836d85690beb55be45d19726210ab5b47a83f86856f46e2e4314
  TimelinePromptCard.tsx: 923a408dfd5c933a7fea8daeff810365e3c491d3a4ed0da2d0e4298d979e55ae
  TimelineSpeechButton.tsx: 9904500f57ea6fe3c9d539adb5c91b1fd07d7fc37e45a484d675e81562027b6f
  TimelineView.tsx: acd1736f5df95c71869eb6ab89702264b149a5ec33d83e7551016cbcf9153d44
  TimelineWebTreeToolbar.tsx: 59155acfbccef1b730cdfbcd7e7dde744a1a737cb992342542aba9b8b86261f3
  treeHeaderInTimelineIntersection.ts: 338982ab7e65bfb904f58e639244f320854248a46378132144242ed87879f2aa
  types.ts: 780cc9fbeaaeaa1345ead3e54ad72d8f2c300747db9a7c94f95de5f28d481bbe
children:
---

# web/src/components/timeline

## Purpose
Solid components for rendering and controlling timeline cards in the web UI. It centralizes card chrome, command/web result integration, speech, tree toolbars, and timeline item routing.

## Files
- `attachTimelineTreeHeaderInViewEffect.ts` - Solid effect that tracks whether a web tree header remains visible below a timeline card’s sticky header.
- `timelineCardHeadIcons.tsx` - Reusable SVG icon set and sizing helpers for timeline card headers and toolbars.
- `TimelineCollapsibleCard.tsx` - Shared expandable timeline card shell with header controls, dismiss handling, and preserved hidden body state.
- `TimelineCommandResultCard.tsx` - Renders command-result cards, including web/client views, widget help, tree controls, speech, and story playback.
- `TimelinePromptCard.tsx` - Renders prompt timeline cards with collapsible web/text output and speech controls.
- `TimelineSpeechButton.tsx` - Provides browser or Piper TTS playback controls and derives readable text from prompt web trees.
- `TimelineView.tsx` - Top-level timeline dispatcher that renders item-specific cards, diffs, tool activity, chat, reasoning, and layout settings.
- `TimelineWebTreeToolbar.tsx` - Sticky-header toolbar adapter for registered web tree actions, filtering, expansion, refresh, and story targets.
- `treeHeaderInTimelineIntersection.ts` - IntersectionObserver binding that reports tree-header visibility within a timeline viewport.
- `types.ts` - Defines the callback-heavy props contract consumed by the timeline view and its cards.

## Notes
- Cards share sticky headers, collapse behavior, and compact toolbar controls.
- Web tree controls move into the sticky header after the in-content tree header scrolls away.
