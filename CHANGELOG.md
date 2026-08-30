# Changelog

All notable changes for each version are listed under the corresponding `v*.*.*` tag.
Tags and this file are updated by the post-commit hook when you commit with `--patch`, `--minor`, or `--major` (see CONTRIBUTING.md).
You can also run `bun run release:changelog` to rewrite this file from tags.

## [v12.2.0] - 2026-08-30

- feat: introduced fuzzy-file-search.v1 capability and composer file picker (739c292b)

## [v12.1.4] - 2026-08-30

- fix: make setup page accessable via nostr if BOT_MASTER_PUBKEY is defined and matches (303ef531)

## [v12.1.3] - 2026-08-28

- fix: update container actions for Node 24 (fbb152dd)

## [v12.1.2] - 2026-08-28

- fix: keep container publishing workflow green (f867a2d8)

## [v12.1.1] - 2026-08-28

- fix: publish managed hosting image publicly (cc4d9aa6)

## [v12.1.0] - 2026-08-28

- feat: add Alpine image for managed hosting (c61406dc)

## [v12.0.1] - 2026-08-27

- docs: update changelog for v12.0.0 (d8a5f7ac)
- fix: removed loading messages from "Review changes" (file diff) (eb2dbb9b)

## [v12.0.0] - 2026-08-27

- test hook 3 (591a1f81)
- fix: testing new git commit hook flow --patch (7fbd8b8a)
- chore: start v12 release (304f075a)

## [v11.5.3] - 2026-08-27

- feat: breaking change: introduced new PluginAgentService in PluginContext, removed AGENTS.md loading from opencode --major (170f508e)
- fix: keep caddy files between same host deployments in order to avoid Let's Encrypt rate limits --patch (8c31ce6b)
- fix: opencode auth error handling --patch (0176008c)
- fix: improved headless auth flow for completeness --patch (56cb5f86)
- fix: hide forms when action is done --patch (d42292e8)
- fix: improved plugins releases widget performance --patch (0df50900)
- fix: checking git hooks (cc67b385)
- fix: checking git hook 2 (f5c3f11f)

## [v11.5.2] - 2026-08-24

- fix: preserve Nostr reference sharing settings (48a36bb2)

## [v11.5.1] - 2026-08-24

- fix: settle interrupted OpenCode prompts safely (ed5b89b8)

## [v11.5.0] - 2026-08-24

- feat: support OpenCode device authorization codes (f5ea6015)

## [v11.4.9] - 2026-08-24

- fix: normalize repeated web form arguments (ef342164)

## [v11.4.8] - 2026-08-24

- docs: note preserving Caddy certificate state (b02d3432)

## [v11.4.7] - 2026-08-22

- fix: setup opencode config should have a retry button if /api/setup/opencode/auth (45s timeout) fails (85c4fd98)

## [v11.4.6] - 2026-08-22

- fix: trying to simplify opencode port forwarding (824d1246)

## [v11.4.5] - 2026-08-21

- fix: opencode timeout is 30s now, except EADDRINUSE (8f13a00d)

## [v11.4.4] - 2026-08-21

- fix: added logs for failing script (12ba4158)

## [v11.4.3] - 2026-08-21

- fix: web setup page piper install indicator (6055a1e0)

## [v11.4.2] - 2026-08-21

- fix: source profile to run bun (6e9fb1a6)

## [v11.4.1] - 2026-08-21

- fix: alpine OS setup script on git dependency and caddy setup (283fae82)

## [v11.4.0] - 2026-08-21

- feat: alpine OS setup script (b6936181)

## [v11.3.1] - 2026-08-21

- fix: small wording fixes on version mismatch when the app coreApiVersion is less than current AppWeaver version (9a70dfa7)

## [v11.3.0] - 2026-08-21

- feat: run piper as a service option added (bd4b9008)

## [v11.2.10] - 2026-08-21

- fix: Cannot find module '../generated/plugins' when no plugin is installed (6df763f6)

## [v11.2.9] - 2026-08-21

- fix: soften coreApiVersion restriction on lower version (14b90864)

## [v11.2.8] - 2026-08-21

- fix: removed unnecessary quite flag (ca71e37e)

## [v11.2.7] - 2026-08-21

- fix: frontend setup page piper binary bug (9409cc79)

## [v11.2.6] - 2026-08-21

- fix: piper binary now accepts "python3 -m piper" (e72eee5d)

## [v11.2.5] - 2026-08-20

- fix: nak is an optional dependency --patch (8442bb71)
- fix: setup redirect bug (017d2113)

## [v11.2.4] - 2026-08-20

- feat: AI intervention and session diff tools --minor (26812a38)
- feat: add authenticated OpenAI-compatible inference API --minor (ca0c7002)
- feat: capability labeling fix with NIP-32 and plugin release management improvements --minor (31f8b2c0)
- feat: new gallery section --minor (b5e5908c)
- docs: new bottomup design document --patch (ba5b2741)
- feat: milestone 1 for plugins releases changes --minor (087338a1)
- fix: some of the plugins workflow has been fixed --patch (93e82a35)
- feat: opencode added support for `question.asked` message and the question/prompt widget --minor (ac938907)
- fix: refactor roadmap as a library to be used by apps/landing and src/commands/roadmap which fixes the issue loading problem in src/commands/roadmap --patch (71d4a6e5)
- feat: many nostr post element fixes, added highlight support --minor (1d8bdff2)
- fix: added --host argument to run-start script --patch (bcd74bcf)
- fix: Production no longer sets BOT_SETUP_UI_ORIGIN to localhost (d1d56ab4)

## [v11.2.3] - 2026-08-12

- chore: update packages (4ccae42d)

## [v11.2.2] - 2026-08-12

- fix: apply NIP-B7 blossom URL resolution (028c109f)

## [v11.2.1] - 2026-08-12

- fix: support legacy generated plugin registrations (e3057425)

## [v11.2.0] - 2026-08-12

- feat: add configurable workspace AI instructions (87fbd3df)

## [v11.1.3] - 2026-08-11

- fix: changed from switch button to checkbox in skill manager dialog (dc908067)

## [v11.1.2] - 2026-08-11

- fix: small nostr fixes (3ae156bd)

## [v11.1.1] - 2026-08-11

- fix: lint (1af81b4b)

## [v11.1.0] - 2026-08-11

- feat: skill manager (4c2ba9f3)

## [v11.0.3] - 2026-08-04

- fix: make textarea resizable (ba3bae36)

## [v11.0.2] - 2026-08-04

- fix: web push (3d205aec)

## [v11.0.1] - 2026-08-04

- nit: added --depth=1 to git clone commands (1ae93fec)

## [v11.0.0] - 2026-08-02

- feat: expand WebNode interactions and profile workflows (96f83251)

## [v10.1.2] - 2026-08-02

- chore: add Nostr publish diagnostics (e64025b2)

## [v10.1.1] - 2026-08-02

- fix: improve X link previews (29605e8c)

## [v10.1.0] - 2026-07-30

- feat: add capability services and optimistic web actions (f952afc2)

## [v10.0.1] - 2026-07-23

- fix: scope landing roadmap event loading (324ce153)

## [v10.0.0] - 2026-07-23

- feat: add keyed WebNode reconciliation (a03a1cfe)

## [v9.55.0] - 2026-07-23

- feat: integrate Nostr interactions with event resolution (b709f976)

## [v9.54.1] - 2026-07-23

- docs: refresh bottom-up workspace guides (a99281cf)

## [v9.54.0] - 2026-07-22

- feat: add cached Nostr event resolution (f9f8a111)

## [v9.53.6] - 2026-07-22

- fix: harden web previews and widget assets (813cf3dc)

## [v9.53.5] - 2026-07-15

- chore: ignore local Caddy configuration (eb0000bb)

## [v9.53.4] - 2026-07-15

- chore: remove deprecated TypeScript base URL (2c9ff4a1)

## [v9.53.3] - 2026-07-15

- fix: serve crawlable app pages and refresh content (d6c1108d)

## [v9.53.2] - 2026-07-15

- fix: simplify web viewport and manifest handling (0233464d)

## [v9.53.1] - 2026-07-15

- fix: improve relay defaults and DM subscriptions (3cf9f613)

## [v9.53.0] - 2026-07-15

- feat: expand Nostr post interactions (697d2145)

## [v9.52.0] - 2026-07-08

- feat: generate static plugin pages with SEO meta tags (0ff1d8e7)

## [v9.51.13] - 2026-07-08

- fix: add nostr-radar to landing routes (de5c3518)

## [v9.51.12] - 2026-07-08

- fix: landing page hero apps icon fix for nr (77f81e04)

## [v9.51.11] - 2026-07-08

- build: final demo refresh (e65a215e)

## [v9.51.10] - 2026-07-08

- build: refresh demo and landing source (966a026c)

## [v9.51.9] - 2026-07-08

- style: add nostr radar to hero animation with reduced-motion support (660c4158)

## [v9.51.8] - 2026-07-08

- refactor: use topbar-actions-left container for right-placement widgets (4bf53d13)

## [v9.51.7] - 2026-07-08

- build: finalize demo assets (df342c73)

## [v9.51.6] - 2026-07-08

- build: refresh demo with nr widget (38658359)

## [v9.51.5] - 2026-07-08

- fix: right widgets on left, header widgets on right, proper icon path (e9cc130f)

## [v9.51.4] - 2026-07-08

- chore: cleanup stale nr icon file (1af9badc)

## [v9.51.3] - 2026-07-08

- chore: include nr icon for landing grid (30b59f27)

## [v9.51.2] - 2026-07-08

- fix: correct nr icon path for landing grid (b0c7887f)

## [v9.51.1] - 2026-07-08

- build: update demo and landing assets (a7b0e4df)

## [v9.51.0] - 2026-07-08

- feat: add right-side header widget placement for Nostr Radar (175cb325)

## [v9.50.1] - 2026-07-08

- fix: restore missing apps and add nostr radar branding (a503fc08)

## [v9.50.0] - 2026-07-08

- feat: add nostr radar landing page (d1dda254)

## [v9.49.1] - 2026-07-07

- fix: update web icons and host binding (492509c0)

## [v9.49.0] - 2026-07-07

- feat: add nostr web primitives and wot services (ab98ddd6)

## [v9.48.0] - 2026-07-01

- feat: support structured web command parsing (a28ed413)

## [v9.47.6] - 2026-07-01

- fix: improve PWA push notifications debugging (199a9f6a)

## [v9.47.5] - 2026-07-01

- fix: apps/landing SEO improvements (0e864e53)

## [v9.47.4] - 2026-06-30

- fix: added footer support for nostr posts (73888590)

## [v9.47.3] - 2026-06-28

- blog: new post: "Why build an AppWeaver app?" (a8cb94be)

## [v9.47.2] - 2026-06-28

- fix: blog engine fixes, type fixes (5055847a)

## [v9.47.1] - 2026-06-28

- fix: changed apps route to apps/bookmark-manager and so on (7e75c4d7)

## [v9.47.0] - 2026-06-28

- feat: new nostr supported blog engine for landing app (ec6d8df7)

## [v9.46.3] - 2026-06-28

- fix: fetch zapped profile with query relays (744e2bbe)

## [v9.46.2] - 2026-06-27

- fix: moved zap count into issue summary, fixed filter (90bba8a3)

## [v9.46.1] - 2026-06-26

- docs: update roadmap and blog drafts (a58352e8)

## [v9.46.0] - 2026-06-26

- feat: resolve direct nostr plugin install targets (e89f6204)

## [v9.45.1] - 2026-06-26

- feat: align landing roadmap relay discovery (a8a7e988)

## [v9.45.0] - 2026-06-26

- feat: add roadmap board creation flow (02319741)

## [v9.44.0] - 2026-06-26

- feat: resolve roadmap relays from nostr repo addresses (9382440a)

## [v9.43.2] - 2026-06-18

- fix: added tree item spacer back (ee4311da)

## [v9.43.1] - 2026-06-17

- fix: subscribe before publishing bunker requests (76970805)

## [v9.43.0] - 2026-06-17

- feat: add relay-backed roadmap panels (92e6db04)

## [v9.42.2] - 2026-06-17

- refactor: share nostr author identity helpers (303aceee)

## [v9.42.1] - 2026-06-14

- docs: add story system blog draft (88845ae5)

## [v9.42.0] - 2026-06-14

- feat: add landing demo recorder and showcase UI (bd7030a4)

## [v9.41.0] - 2026-06-14

- feat: improve story playback controls and targets (0124f073)

## [v9.40.4] - 2026-06-09

- fix: todo duel story (cf88f756)

## [v9.40.3] - 2026-06-09

- fix: working indicator height problem (857bbbdc)

## [v9.40.2] - 2026-06-09

- local first blog post (de47166a)

## [v9.40.1] - 2026-06-09

- build: deploy landing page (04025577)

## [v9.40.0] - 2026-06-09

- feat: add Cashu melt flow and history kinds (16e4e0a6)

## [v9.39.0] - 2026-06-08

- feat: add Routstr provider index and discovery (c4241417)

## [v9.38.0] - 2026-06-07

- feat: add Cashu wallet setup and web wallet modal (fbe6f13d)

## [v9.37.8] - 2026-06-05

- fix: persist interrupted chat status (6596adba)

## [v9.37.7] - 2026-06-05

- refactor: split WebNodeRenderer into focused modules (4aa4eb04)
- fix: enter on mobile doesn't submit form (fc5eb61f)

## [v9.37.6] - 2026-06-05

- ref: xxx (b5f0e59c)

## [v9.37.5] - 2026-06-05

- fix: tone status update trigger (b9c2aea0)

## [v9.37.4] - 2026-06-05

- fix: segment streamed reasoning cards (24829b23)

## [v9.37.3] - 2026-06-05

- fix: improve opencode stream UI handling (39e7adbb)

## [v9.37.2] - 2026-06-05

- fix: no need for open in timeline button in the toolbar (e2de03c5)

## [v9.37.1] - 2026-06-04

- fix: update blog todo (f41dd629)

## [v9.37.0] - 2026-06-04

- feat: show plugin updates blocked by core version (76447f51)

## [v9.36.1] - 2026-06-04

- fix: expand tree items before reveal actions (7c4a77fb)

## [v9.36.0] - 2026-06-04

- feat: add file web editing primitives (03ca9372)

## [v9.35.1] - 2026-06-03

- fix: improve prompt cleanup and chat diagnostics (ce2eaa15)

## [v9.35.0] - 2026-06-03

- feat: add nostr tooling setup recommendations (d4baf91b)

## [v9.34.0] - 2026-06-03

- feat: add opencode session context actions (cf75e017)

## [v9.33.3] - 2026-06-03

- added new blog posts (fac3eec8)

## [v9.33.2] - 2026-06-01

- ref: added more debug logs to web app with localstorage support (c27eb2fc)

## [v9.33.1] - 2026-06-01

- ref: added more debug logs for prompt issues (3bf66463)

## [v9.33.0] - 2026-06-01

- feat: get core changelog (12fb494d)

## [v9.32.3] - 2026-06-01

- fix: update-check would paint bot status button to green (a254eb2d)

## [v9.32.2] - 2026-06-01

- fix: show changelog button (779e4a4a)

## [v9.32.1] - 2026-06-01

- fix: don't give update option if already up-to-date (7b73afe4)

## [v9.32.0] - 2026-06-01

- feat: bot update via git (3d5c5ef3)

## [v9.31.3] - 2026-06-01

- fix: trying to catch rate limit errors (32e0a6d7)

## [v9.31.2] - 2026-05-31

- fix: sometimes composer doesn't add to timeline (afbe849a)

## [v9.31.1] - 2026-05-31

- not needed git skill (a5f6b278)

## [v9.31.0] - 2026-05-31

- feat: add core update check indicator (7ad43b5f)

## [v9.30.3] - 2026-05-31

- fix: tame opencode sdk server CPU usage (410ed642)

## [v9.30.2] - 2026-05-31

- fix: split timeline thinking card from assistant card (5818a342)

## [v9.30.1] - 2026-05-31

- fix: the story engine reload bug (abcff0d2)

## [v9.30.0] - 2026-05-30

- added changelogs to plugins intall (d4ccf583)

## [v9.29.0] - 2026-05-29

- added bot restart to the account top menu (4b0032de)

## [v9.28.1] - 2026-05-28

- fix: preserve dock widgets across timeline updates (7c04205a)

## [v9.28.0] - 2026-05-28

- feat: add plugin update flow (be63683c)

## [v9.27.8] - 2026-05-28

- fix: standardize web host port env vars (ca90e40c)

## [v9.27.7] - 2026-05-28

- fix: improve demo widget playback tracking (52c8098c)

## [v9.27.6] - 2026-05-28

- fix: configure local web server startup (e13d49b8)

## [v9.27.5] - 2026-05-28

- feat: add plugin release publishing commands (9330e426)

## [v9.27.4] - 2026-05-27

- fix: improve setup and palette input handling (ffa4fa74)

## [v9.27.3] - 2026-05-27

- fix: center landing intro header (ec1fbbf0)

## [v9.27.2] - 2026-05-27

- fix: restore account menu and hide demo widgets (cd21cf97)

## [v9.27.1] - 2026-05-27

- feat: refresh landing brand presentation (31f1a16f)

## [v9.27.0] - 2026-05-27

- feat: improve demo playback and header chrome (3abd90fa)

## [v9.26.0] - 2026-05-26

- feat: polish landing demo flow (ddfd3d1b)

## [v9.25.1] - 2026-05-26

- fix: scroll highlighted refresh targets (efb12799)

## [v9.25.0] - 2026-05-24

- feat: polish plugin landing pages (8d9e7587)

## [v9.24.0] - 2026-05-23

- feat: add plugin landing demos (d92187de)

## [v9.23.1] - 2026-05-23

- fix: suppress demo programmatic focus (ad5eaad3)

## [v9.23.0] - 2026-05-22

- feat: add fixture-backed landing demo (7c57bb0f)

## [v9.22.1] - 2026-05-21

- fix: expand landing demo timeline (bfb413c1)

## [v9.22.0] - 2026-05-21

- feat: refresh landing copy and demo assets (9043b4fe)

## [v9.21.4] - 2026-05-21

- fix: improve setup web startup links (c48d6422)

## [v9.21.3] - 2026-05-21

- fix: style widget help open state (6fd484a9)

## [v9.21.2] - 2026-05-20

- fix: highlight first-run setup URL (268b8a00)

## [v9.21.1] - 2026-05-20

- fix: polish setup dependency UI (34998707)

## [v9.21.0] - 2026-05-20

- feat: add setup dependency checks (22883d7c)

## [v9.20.2] - 2026-05-20

- fix: restore setup page scrolling (9bf51d2c)

## [v9.20.1] - 2026-05-20

- fix: improve plugin install feedback (3b759a51)

## [v9.20.0] - 2026-05-20

- feat: add plugin install metadata support (1110dbb3)

## [v9.19.0] - 2026-05-20

- feat: publish plugin title metadata (cad18894)

## [v9.18.1] - 2026-05-19

- fix: style of certain buttons (169418c8)

## [v9.18.0] - 2026-05-19

- feat: add nostr search relay web support (6fa1b35e)

## [v9.17.1] - 2026-05-17

- fix:rename dm-bot to appweaver (6f448a3b)

## [v9.17.0] - 2026-05-17

- feat: improve bunker signing UX (9b53fd3d)

## [v9.16.0] - 2026-05-16

- feat: copy current diff line references (97727438)

## [v9.15.4] - 2026-05-16

- docs: clarify journal publish wording (f95564a4)

## [v9.15.3] - 2026-05-16

- docs: update plugin branding names (5684b1a4)

## [v9.15.2] - 2026-05-16

- docs: add Captain's Log plan (0d0c3f27)

## [v9.15.1] - 2026-05-16

- fix: refine web dock header spacing (b613fb02)

## [v9.15.0] - 2026-05-16

- feat: add native session adoption (e634fd36)

## [v9.14.1] - 2026-05-16

- fix: support richer WebNode interactions (a06508cf)

## [v9.14.0] - 2026-05-16

- feat: add generic Nostr publish action (01f41d00)

## [v9.13.0] - 2026-05-16

- feat: add widget help stories UI (61fe9cea)

## [v9.12.0] - 2026-05-15

- feat: support persistent web UI reveal state (26b61501)

## [v9.11.0] - 2026-05-14

- feat: add desktop widget dock layout controls (57d04db5)

## [v9.10.7] - 2026-05-13

- fix: preparing branding (0e15d6cc)

## [v9.10.6] - 2026-05-13

- fix: agent stream git diff summary (935a0ee7)

## [v9.10.5] - 2026-05-13

- fix: branding related changes (7316da0c)

## [v9.10.4] - 2026-05-13

- fix: opencode scroll fix, added todo tool card (e3cfcd61)

## [v9.10.3] - 2026-05-13

- fix: agent behavour and apply_patch (3e3ef879)

## [v9.10.2] - 2026-05-13

- fix: for todo copy to clipboard (9c665ef7)

## [v9.10.1] - 2026-05-13

- fix: improve landing demo playback controls (8889ea4f)

## [v9.10.0] - 2026-05-12

- feat: add WebNode scroll on mount support (051a54a2)

## [v9.9.16] - 2026-05-12

- docs: clarify plugin git status (e5cf935b)

## [v9.9.15] - 2026-05-12

- refactor opencode parts parser (bfb90f66)

## [v9.9.14] - 2026-05-12

- eslint advice (6be541e6)

## [v9.9.13] - 2026-05-12

- added dhalsim to nip05 and lud16 (af2fb9d5)

## [v9.9.12] - 2026-05-12

- fix: improve opencode stream patch handling (2a4ef0b1)

## [v9.9.11] - 2026-05-12

- fix: complete AppWeaver rebrand cleanup (f199b93d)

## [v9.9.10] - 2026-05-11

- fix: improve web chat controls (47bc4e5e)

## [v9.9.9] - 2026-05-11

- fix: align setup and opencode model state (70836176)

## [v9.9.8] - 2026-05-11

- fix: improve docker setup runtime (736652ee)

## [v9.9.7] - 2026-05-11

- fix: use workspace root for opencode agents (da3fec47)

## [v9.9.6] - 2026-05-11

- fix: run docker workspace as non-root (6a25554a)

## [v9.9.5] - 2026-05-11

- fix: persist opencode setup auth state (56c871db)

## [v9.9.4] - 2026-05-11

- fix: add dbus for docker vnc session (03bc2a9d)

## [v9.9.3] - 2026-05-11

- fix: detect opencode oauth setup status (b930aa74)

## [v9.9.2] - 2026-05-11

- fix: show opencode auth completion (a2207c5e)

## [v9.9.1] - 2026-05-11

- fix: rebuild web UI on startup (fd83f0c6)

## [v9.9.0] - 2026-05-11

- feat: add timeline event command outputs (152a29dd)

## [v9.8.0] - 2026-05-11

- feat: add setup web configuration flow (248d0a34)

## [v9.7.0] - 2026-05-09

- feat: add docker setup flow (aab6b207)

## [v9.6.4] - 2026-05-09

- fix: skip startup wallet state hydration (6906d97d)

## [v9.6.3] - 2026-05-09

- fix: render modal timeline UI outputs (a10e7819)

## [v9.6.2] - 2026-05-08

- fix: preserve narrowed story widget targets (0f0acefa)

## [v9.6.1] - 2026-05-08

- fix: restore web dist SPA fallback path (5a886831)

## [v9.6.0] - 2026-05-08

- feat: add interactive roadmap issue actions (778b524f)

## [v9.5.2] - 2026-05-08

- fix: improve plugin catalog publishing and queries (9dc1a9d6)

## [v9.5.1] - 2026-05-08

- fix: point status agent actions at nested command (26f7e750)

## [v9.5.0] - 2026-05-08

- feat: sync wallet state over nostr (2f8f74fc)

## [v9.4.0] - 2026-05-08

- feat: nest AI agent management commands (a5542438)

## [v9.3.4] - 2026-05-08

- fix: hide piper TTS control when unavailable (7e88c72d)

## [v9.3.3] - 2026-05-08

- demo app doesn't support piper TTS (d144d7d9)

## [v9.3.2] - 2026-05-08

- serve nip05 and lud16 for appweaver account (a16ec053)

## [v9.3.1] - 2026-05-06

- added vercel api function to serve nostr.json in apps/landing (341ef5d7)

## [v9.3.0] - 2026-05-06

- roadmap and plugin management (6dba4efe)

## [v9.2.4] - 2026-05-03

- bun run start should start the UI too (6a0f4ac5)

## [v9.2.3] - 2026-05-03

- trying bun run start, 5551 asset 404 error fix (804797d2)

## [v9.2.2] - 2026-05-03

- fix pwd on windows (5fb877db)

## [v9.2.1] - 2026-05-03

- fix state table not exist error (b7daf3a0)

## [v9.2.0] - 2026-05-03

- demo improvements, and other improvements (af402922)

## [v9.1.0] - 2026-05-01

- demo system (8bd4b3fb)

## [v9.0.1] - 2026-04-16

- landing page and improved PWA web page (f8350bb4)

## [v9.0.0] - 2026-04-15

- AppWeaver branding. New web interface (edc304c7)

## [v8.1.1] - 2026-03-31

- get rid of env in the backend creation (4f69cdce)

## [v8.1.0] - 2026-03-29

- bunker add list commands (c91d5da7)

## [v8.0.0] - 2026-03-28

- wot (1d786899)

## [v7.9.0] - 2026-03-28

- redraw fixes and checkpoint for wot (2c49cc4d)

## [v7.8.1] - 2026-03-27

- fixes on publish scripts (2a4a084e)

## [v7.8.0] - 2026-03-27

- publish skill and scripts (2378ec8b)

## [v7.7.0] - 2026-03-23

- new prompt functionality for plugin interactive loops (045715b2)

## [v7.6.0] - 2026-03-23

- Initial commit: Add dm-bot NIP-17 agent, project rules, and supporting files (741cc78c)
- Update bot configuration and documentation (2b0cda0e)
- Refactor code style and improve documentation (7f83038a)
- Enhance message chunking and error handling in DM publishing (6a9be7b4)
- add UNLICENSE LICENSE file (80f5b668)
- Add !ask shortcut for mode switching. (43b8694c)
- Update README and agent-cli-permission rules for npm script whitelisting (2df04f75)
- Update watch mode functionality and documentation (90be9346)
- Add local/remote reply transport commands and local-only bot mode. (9734e6bc)
- Implement workspace targeting and post-agent linting functionality (19b39a48)
- Add publish-10050.sh script for DM relay publish (7f02e042)
- new backend opencode (4f1d4c75)
- fix (4096912f)
- big refactor (70461629)
- fixed a minor bug (c1c667e1)
- fixed a minor bug (e6b50344)
- new commit hook that bumps package.json version using semver rules --minor (fcf4b2d2)
- docs: add contributing guide --minor (3af210d7)
- fix version bump was after commit --patch (84c99f4a)
- fix again (2c9af978)
- try again (f0d8ce0f)
- test commit (4d88bb42)
- fix: another test (version was 1.2.4) (7bea7e09)
- fix: try again (version was 1.2.6 now set back to 1.0.0) (d9692699)
- fix: try again (version was 1.0.0 and not staged, I expect to see 1.0.1 after commit) (e1d9441c)
- chore: replace prepare-commit-msg with commit-msg and post-commit hooks (255a4a26)
- cashu wallet is added (78270307)
- test version bump (c6444f3e)
- checkpoint on integration (c2e76fc7)
- fix Cashu wallet bugs. Added new setup scripts for wallet and nostr configuration (3b44ab9c)
- improved logging, wallet setup, error handling with retries for token reception. (875d2f0c)
- fix: added fail over forgotton commit version postfix (c1ea8a43)
- forgot a semicolon (887373f8)
- better logging in wallet operations (7df9c683)
- checkpoint (f8dd146b)
- refactor checkpoint (1b50fcc3)
- fixes (135feb2c)
- refactor index.ts, prevent flash crashes when running with run-with-restart (ac083341)
- Add OpenCode SDK backend and new bot commands (!lint off, !log info off, !ready off) (b805c756)
- added warn messages when provider has changed and the model is incompatible (a724e09f)
- new command to add models to the opencode.json from provider/routstr models (f8f2bf28)
- fixed opencode-sdk + routstr prompting by copying the .env variables into the process (65024e25)
- cleaning (ee701794)
- updated readme with installation instructions (8eb23e23)
- Enhance README with Cursor and Routstr integration details - (ad057d1e)
- main repo (dc8c4ae6)
- added links to readme (3b69be89)
- add task scheduling functionality (9837889d)
- publishing kind 0 event for the bot in the nostr-setup script (6c96453d)
- fixed accidental ansi leakage to the DMs (4601ea3e)
- Update workspace command usage messages to include dynamic options (0b7b23fd)
- Add contributing guidelines to the AI rules with a reference to the CONTRIBUTING.md file (b0500415)
- added missing dependencies and prettier config (8b68539f)
- nits --patch (9cffa0e0)
- Remove test.txt (67f25414)
- improved contributing rules (60b1aa09)
- test (31cb0483)
- why is the version flag not enforced (40010eae)
- yo (6eaa86e1)
- fix post commit (be5953a0)
- chore: remove test.txt --patch (7649d35c)
- chore: CLI test for bun hooks (3d62d81d)
- git scripts are now bun (d32446d7)
- chore: remove test.txt (f552d02f)
- fix: task current time & timezone (78ba355d)
- test push (7513ecd6)
- test: add file-sync (7bffee5a)
- test: add file-sync spec (32c8da37)
- feat: sync file between bot instances --minor (ee269e37)
- potential bug fix --patch (30ad8574)
- fix file paths --patch (bba04e9c)
- test: add bun.lockb (056e3d08)
- lint (541913c9)
- added `!bot npub` command (5787aaab)
- feat: add !bot restart command and enhance lint functionality: `!lint` manually runs the lint by the bot (136ee61e)
- chore: update contributing guidelines and add ngit-helper script for improved Git workflow (6ac1643f)
- checkpoint (f5a84b23)
- refactor: update todos table schema to use INTEGER for IDs and adjust related types in TypeScript (031a7e93)
- feat: todos schema, commands and formatting (e821f2de)
- feat: add schedule_description to task schema and related functions (53897de5)
- feat: implement todo AI command and enhance todo tools (bc09a0b8)
- fix (6451dbe1)
- feat: status reporting, workspace PWD (1b9af1f3)
- enhance new session command with status reporting (f2ebb0fb)
- finilize todos (f51eb31e)
- cleanup (be02734f)
- renamed tasks to jobs (2e970ffb)
- new docs for future features (5706ebf1)
- Put the Todo Draft ID in the outputs and descriptions of the prompt (26d3c9be)
- feat: introduce job AI command for natural language job creation and implement draft storage (96d5291a)
- Use z.infer to derive TS types from Zod schemas (1067abe1)
- refactor: reorganize todo-ai command structure and enhance draft handling (b3a8919a)
- trying to fix opencode-sdk no response bug (4be2da84)
- fix: add model override logging and ensure correct input structure for session prompts in opencode-sdk (ec9e5eb6)
- workaround of parent opencode-sdk bug (0130b2f8)
- fixed a bug with the workspace folder calculation, replaced npm run with bun run in the docs, added workspace_target to jobs table (5571994f)
- cleanup, index.ts refactor (c8f209b5)
- fix cwd bugs and unnecessary session creation in todos and jobs (0526fff3)
- new plugin system, migrated todos (e35201f6)
- improved bunker in the publish plugin script (2e12558d)
- fix failure when plugins.json does not exist (f309c67a)
- adding repo url to plugin event (17cb8679)
- fix: proper install-plugin script (df215612)
- fix plugin:generate (8dd2daa2)
- fix generate tools plugin path by alias (226cfcd1)
- fix delete is not allowed as a variable declaration name in tool generation (67eb5d7f)
- fix: fail when no plugins installed and generated folder is not generated yet (d1f7e553)
- removed hard coded tool names (86b827b2)
- fix: disable default linting setting (6190b446)
- refactor: enhance install-plugin script to support updating plugins and improve repo identity resolution (e72c5fd7)
- new documentation on PLUGINS, new script for bot-setup (87c74340)
- refactor: update bot setup script to manage .gitignore entries and improve symlink handling (c463f354)
- big refactor, new plugin system (cc464d97)
- removed core jobs, and fixes (9c811e45)
- feat: add optional description field to plugin schema and enhance event content handling (3de7ad88)
- nits (996e49e1)
- small refactor (8c04144a)
- lint (67decbbd)
- bot setup script, for cursor backend ask for CURSOR_API_KEY (70c6916d)
- updated plugins.md (3a396bef)
- new plugin template and script (d360a364)
- lint (bd273d51)
- lint (c96737c8)
- lint (0187f7bd)
- plugin:new runs lint after creating the files. changed plugin template extension from .ts to .ts.template (5a021e01)
- New plugin tooling via CLI and SKILLS files. (0d1edd1c)
- install plugin version checks (310d7971)
- fix (c09149e8)
- bot setup script to create symlinks for skill folders in parent project (0e112726)
- send dm skill added (04030518)
- docs fix (4f08459e)
- workspace-tree skill (337eb624)
- some fixes, moved file to its own plugin (53a704bf)
- documents (77fd1979)
- fix DB lock issue with WAL mode (9f15a254)
- added bunker management script (ac54f2df)
- bunker script (6f0837d5)
- Enhance contribution guidelines and scripts for versioning and changelog management. Added support for plugin repositories and improved commit message handling in hooks. (32d63c8a)
