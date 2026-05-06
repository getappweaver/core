---
direct_hash: 63e0edad7ede9e1f5b033b338b3c9a44e7117c549aab3a7738046e465979e832
subtree_hash: 7f54b7b11941bedad363cf97aeac94554b18c3ac99bb45f94dd683dfd18c6c0c
files:
  plugins.svg: d43e80670395a7ca4aa1d4896d6df2549d0459d7d403e58c45b3273c5d8e4182
  text.ts: 81835f57ea517f64872b0613654b55fab4674bd4a07b904794daa5d8cf55d2ed
  web.ts: fbed0bf2089e4d1e7ccbb98e8d7f73f8586f99facb3ec89740ae9793168773e8
children:
---

# install/renderers

## Purpose
Contains renderers for plugin install command output, supporting text and web (WebNode) formats, plus an associated SVG icon.

## Files
- `plugins.svg` - SVG icon for the plugins install feature.
- `text.ts` - Plain text renderer for plugin install command output.
- `web.ts` - WebNode renderer for plugin install results with styled cards and badges.

## Notes
- Text renderer outputs plain strings for CLI-style responses.
- Web renderer generates WebNodeRoot payloads with scoped styles.
- Web renderer structures plugin entries as styled cards with status badges.
