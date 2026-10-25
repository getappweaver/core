---
name: feature-media
description: Guide and reference for creating high-fidelity 60 FPS WebM showcase media from StoryDefinition scenarios using EffectCraft.
---

# Feature Media Pipeline (Story -> EffectCraft 60fps WebM)

This skill automates the creation of high-fidelity, cinematic 60 FPS `.webm` feature showcases and poster frames directly from AppWeaver's native `StoryDefinition<TState>` scenarios, using headless Playwright capture and `effectcraft-cli`.

## Core Architecture

1. **Single Source of Truth (`StoryDefinition<TState>`)**:
   - Stories defined in `plugins/<id>/stories.ts` (or command-specific story files) drive both interactive in-app walkthroughs and automated video generation.
   - Use `story.showcase` and `step.showcase: { title, description }` to specify high-level marketing copy.
   - Use `**bold**` and `*accent*` markdown markers in `showcase.description` for punchy kinetic token reveal.
     - Example: `"Collapse noisy branches.\nSurface **branch champions** and your *#1 priority*"`

2. **Focused Headless Capture (`apps/landing/scripts/story-media/capture-story.ts`)**:
   - Boots `http://127.0.0.1:5553/?story=<storyId>&capture=1` in unauthenticated demo sandbox mode at 2x DPR.
   - Automatically suppresses walkthrough overlay DOM popovers (`.story-walkthrough`), demo help panels (`.widget-help-panel`), and input forms (`.todo-ai-prompt-form`).
   - Isolates the exact `.card` widget bounding box, captures `state-1-before.png`, clicks the target, and captures `state-1-after.png` and `state-1-crop.png`.

3. **ExtendScript & EffectCraft Compilation (`apps/landing/scripts/story-media/compile-effectcraft.ts`)**:
   - Emits portable ExtendScript (`composition.jsx`) using dynamic script directory resolution:
     ```javascript
     var DIR = new File($.fileName).parent.fsName.replace(/\\/g, "/") + "/";
     ```
   - Zero machine-specific absolute paths.
   - Top-left `[0, 0]` layer anchoring at `CARD_TOP_LEFT` eliminates vertical jumping between differing card heights.
   - Synchronous dual-shadow crossfade (`Card Shadow Before` $\rightarrow$ `Card Shadow After`) dynamically sizes shadow to before/after card heights, eliminating hanging shadow artifacts.
   - Symmetrical vertical centering: dynamically recenters the shorter filtered card on the 1080p canvas ($Y = 540$).
   - Kinetic token reveal: sub-pixel text measurement (`sourceRectAtTime()`) with `WORD_GAP = 11px`, `PILL_PAD_X = 10px`, and sharp (`roundness: 0`) accent pill backing for `*accent*` tokens.
   - Spotlight blur: ramps `ADBE Gaussian Blur 2` on the base card while highlighting the active action with a cyan stroke box and click ripple.

4. **Plugin Locality & Deliverables (`apps/landing/LOCALITY_PLAN.md`)**:
   - Working/source artifacts live inside the owning plugin:
     `plugins/<pluginId>/landing/story-media/<storyId>/`
     - `manifest.json`
     - `state-1-before.png`, `state-1-after.png`, `state-1-crop.png`
     - `composition.jsx`
     - `composition.ecproj`
     - `spotlight.png`
   - Published production media:
     `plugins/<pluginId>/landing/assets/<storyId>.webm` (60 FPS WebM)
     `plugins/<pluginId>/landing/assets/<storyId>-poster.png` (720p payoff poster at $t=3.5\text{s}$)
   - Ingestion into landing app:
     - Run `bun apps/landing/scripts/generate-content.ts` to mirror assets into `apps/landing/public/plugin-assets/<pluginId>/...`.
     - Declared in `plugins/<pluginId>/landing.ts` under `demoStories`.
     - Rendered seamlessly via `<video autoplay loop muted playsinline poster="...">` without play button chrome.

## CLI Commands

```sh
# Generate showcase media from live Vite demo server
bun apps/landing/scripts/story-media/generate.ts --story <storyId>

# Recompile and re-render using existing capture artifacts
bun apps/landing/scripts/story-media/generate.ts --story <storyId> --reuse-capture

# Sync published media to landing public assets and update registry
bun apps/landing/scripts/generate-content.ts
```
