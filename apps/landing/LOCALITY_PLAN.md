# Content locality — phase 1

## Scope

Plugins own landing content, media, and plugin documentation. The landing app
owns the typed content contract, generators, rendering, and landing-specific
scripts. Local `plugins.json` supplies the plugin list. Generation is local and
static; deployment remains the maintainer's Vercel CLI workflow.

## Implementation

- [x] Export data-only, named `landingPage` definitions from plugins; reuse manifest identity metadata.
- [x] Generate an explicit import registry and copy plugin icons/media into landing `public/` before dev/build.
- [x] Consume the same generated content in app grids, interactive pages, static SEO pages, and sitemap generation.
- [x] Move plugin-specific documents into plugin `docs/` directories and repair local Markdown links.
- [x] Keep reusable core contracts in core docs, linking them from plugin documentation.
- [x] Generate static core/plugin documentation, resolving relative Markdown links and images from source locations.
- [x] Move landing asset/demo-copy and recording scripts into `apps/landing/scripts/` and repair callers.
- [x] Verify static generation/build, targeted lint, and changes in the root and independent plugin repositories.

## Exit criteria

Existing app routes and content remain available; plugins in the local registry
can supply their own landing definition and assets. Static app/docs pages and
their assets are present in the landing build. Source Markdown links work locally
and resolve to generated documentation URLs. No deployment or host restart is
performed.

## Ownership notes

Roadmap, wallet, Nostr event resolution, capability contracts, and the reusable
demo engine remain core-owned. Study is an unimplemented plugin proposal with no
local plugin repository; retain it as a core ecosystem proposal for now. Blog
migration is deferred. Existing plugin work must be preserved.

## Verification progress

- Content generation passed for all 12 registered local plugins.
- Full landing build passed: 12 static app pages, 50 documentation pages, 12
  plugin documentation indexes, and the combined documentation index.
- The existing Vite large-chunk advisory remains; it does not block generation.
- Targeted ESLint passed for the changed TypeScript/TSX files and all 12 plugin
  landing definitions. The full landing TypeScript check passed.
- A focused generated-output inspection passed for all 12 app pages, 45 media
  and legacy URL references, 63 documentation/index pages, and 249 internal
  documentation links/assets, including linked heading anchors.
- Root and plugin changes were reviewed; existing unrelated plugin changes were
  preserved. Root and the touched existing Browser/NR/Todo diffs passed whitespace
  checks. Plugin additions are in their independent repositories, not root Git.
- No test commands, deployment, or host restart have been performed.

## Result and remaining scope

Phase 1 is complete. Eight plugin-specific design/plan documents moved into
Browser, Journal, Memory, File, PPQ, System One, Todo, and Job docs. Core model-source
and runtime ownership now has a core document linked from PPQ. A missing journal
inspection document was restored from the existing documented command behavior;
the missing NR private-scoring image was replaced with a plugin-owned SVG.

Reusable demo/runtime code and fixtures remain in their existing owners. Blog
source migration, core backend/frontend feature restructuring, and the unimplemented
Study proposal remain outside this phase.