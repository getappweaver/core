# Landing app

## Local build

```sh
bun run --cwd apps/landing dev
bun run --cwd apps/landing build
```

The build reads the workspace's local `plugins.json`, generates plugin content
and copies media, builds the blog and documentation into `public/`, runs Vite,
then creates static app pages in `dist/apps/`. Deploy the resulting build with
the existing Vercel CLI workflow. Generators do not publish or deploy anything.

## Plugin-owned content

Each registered local plugin exports `landingPage` from its root `landing.ts`.
Use the data-only `PluginLandingDefinition` type in `content-types.ts`. The entry
must not import plugin initialization, persistence, or server modules.

Identity comes from `plugins.json` and the plugin package manifest. The manifest
icon and landing media paths are relative to the plugin root. Store screenshots
and GIFs in `landing/assets/`. `scripts/generate-content.ts` validates declarations,
copies assets to `public/plugin-assets/<alias>/<plugin-relative-path>`, and writes
explicit imports into `src/generated/plugin-content.ts`. Generated files are not
hand-maintained. All UI and static app generators consume that same registry.
`assetAliases` preserves established `/screenshots/...` URLs for published posts:
development maps them to the namespaced copy, and static app generation copies
them into the corresponding `dist/` path. Their source files remain plugin-owned.
The generated media and docs directories are recreated on generation, so removed
content cannot survive as stale deployed files.

## Documentation

Core documents live in the workspace `docs/`. Plugin documents live in each
plugin/module's `docs/`; local README/architecture documents are included throughout
owned module trees. Dependency, profile, build, and upstream vendor trees are
excluded; first-party vendor summaries live in plugin-owned docs.
The generator excludes the core blog directory, which has its own pipeline.

Use normal relative Markdown links and images. For example, from
`plugins/todo/docs/usage.md`, link to core with
`[Web renderer](../../../docs/WEB_RENDERER.md)`; from a plugin root README the
equivalent path is `../../docs/WEB_RENDERER.md`.

`scripts/generate-docs.ts` follows linked Markdown files, renders GFM (including
tables, task lists, and fenced code), preserves GitHub-style heading anchors,
rewrites document links to static website routes, and copies referenced local
assets. A missing local link or asset fails the build with its source path.
Source Markdown remains readable locally; generated HTML lives in
`public/docs/` and is copied into the deployed static build.

- `/docs/`: complete documentation index
- `/docs/core/<document>/`: core document
- `/docs/plugins/<alias>/`: plugin documentation index
- `/docs/plugins/<alias>/<document>/`: plugin document

## Landing-owned scripts

Asset generation, static app/docs/blog generation, demo copying, story recording,
and IndexNow tools live in `scripts/` here. The reusable demo build/runtime remains
owned by the main workspace and web app.

Implementation progress: [Phase 1 plan](./LOCALITY_PLAN.md).
