# AppWeaver Branding

This document is the canonical source for AppWeaver public naming, descriptions, and project metadata. When a description changes here, sync the public surfaces listed in [Places to keep in sync](#places-to-keep-in-sync).

## Core identity

- **Product name:** AppWeaver
- **Short descriptor:** AI-powered app hub
- **Primary domain:** `getappweaver.com`
- **GitHub org:** `getappweaver`
- **Main GitHub repo:** `getappweaver/core`
- **Nostr/ngit repo:** `nostr://_@getappweaver.com/relay.ngit.dev/core`

## Canonical short description

Open-source app hub for running AI-powered tools from a project or workspace folder you control.

## Canonical longer description

AppWeaver is an open-source app hub for running AI-powered tools from a project or workspace folder you control. Install focused apps like todos, bookmarks, jobs, files, browser actions, and publishing, then use them through chat, the web UI, or AI prompts.

## Nostr account bio

AppWeaver is an open-source app hub for running AI-powered tools from a project or workspace folder you control. Use them through chat, the web UI, or AI prompts, choose your AI providers, and compose focused apps into one shared system.

## GitHub repository metadata

### Main repo

- **URL:** `https://github.com/getappweaver/core`
- **Website:** `https://getappweaver.com`
- **Description:** Open-source app hub for running AI-powered tools from a project or workspace folder you control.
- **Tags:** `appweaver`, `ai`, `agents`, `app-hub`, `local-first`, `self-hosted`, `nostr`, `opencode`, `bun`, `typescript`, `plugins`, `automation`, `open-source`

### Official plugin repos

Use short, predictable names under the `getappweaver` org:

- `getappweaver/todo-plugin`
- `getappweaver/bookmarks-plugin`
- `getappweaver/jobs-plugin`
- `getappweaver/file-plugin`
- `getappweaver/browser-plugin`

Recommended plugin repo description pattern:

> Official AppWeaver app for `<capability>`. Adds focused AI-powered tools, commands, and data models to an AppWeaver workspace.

## Nostr repository announcement metadata

Use this when publishing or updating a NIP-34 repository announcement: <https://nips.nostr.com/34#repository-announcements>.

- **Repository name:** `core`
- **Display name:** AppWeaver Core
- **Clone URL:** `nostr://_@getappweaver.com/relay.ngit.dev/core`
- **Web URL:** `https://github.com/getappweaver/core`
- **Website:** `https://getappweaver.com`
- **Description:** Open-source app hub for running AI-powered tools from a project or workspace folder you control.
- **Tags/topics:** `appweaver`, `ai`, `agents`, `app-hub`, `local-first`, `self-hosted`, `nostr`, `ngit`, `opencode`, `bun`, `typescript`, `plugins`, `automation`, `open-source`

## Website and landing copy

Lead with ownership, tools, and composability:

> An AI-powered app hub on a computer you control.

Supporting copy:

> Run focused tools through chat, the web UI, or AI prompts — from todos and bookmarks to scheduled jobs, files, browser actions, publishing, and more. Your data stays local-first, you choose which apps belong in your hub, and anyone can create new ones.

## Possible tags and topics

Use these for GitHub topics, Nostr repository announcement tags, Nostr profile hashtags, launch posts, bookmark metadata, and app-directory listings. Pick the smallest relevant set for the surface; do not use every tag everywhere.

### Core product tags

- `appweaver`
- `ai`
- `agents`
- `ai-agents`
- `app-hub`
- `ai-tools`
- `developer-tools`
- `automation`
- `productivity`
- `open-source`

### Architecture and ownership tags

- `local-first`
- `self-hosted`
- `user-owned`
- `extensible`
- `plugins`
- `plugin-system`
- `workspace-tools`
- `project-tools`

### Ecosystem and protocol tags

- `nostr`
- `ngit`
- `nip34`
- `opencode`
- `cashu`
- `routstr`

### Technology tags

- `bun`
- `typescript`
- `solidjs`
- `sqlite`
- `vite`

### Official app tags

- `todos`
- `bookmarks`
- `jobs`
- `files`
- `browser-actions`
- `publishing`

### Recommended default sets

Main repo / Nostr repository announcement:

> `appweaver`, `ai`, `agents`, `app-hub`, `ai-tools`, `local-first`, `self-hosted`, `nostr`, `opencode`, `bun`, `typescript`, `plugins`, `automation`, `open-source`

Nostr profile / social posts:

> `appweaver`, `ai`, `agents`, `opensource`, `selfhosted`, `nostr`

Official plugin repos:

> `appweaver`, `plugin`, `ai-tools`, `automation`, `typescript`, plus the app capability tag such as `todos`, `bookmarks`, `jobs`, `files`, `browser-actions`, or `publishing`

## Product vocabulary

### Prefer

- app hub
- apps
- tools
- commands
- skills
- project or workspace folder
- local-first
- self-hosted
- user-controlled infrastructure

### Avoid leading with

- workflows
- platform
- DM bot
- Nostr bot
- remote coding bot

These can still appear as technical details when needed, but they should not be the main public identity.

## Places to keep in sync

- `docs/BRANDING.md` — canonical source of truth
- getappweaver.com landing website
- GitHub main repo metadata
- Official GitHub plugin repo metadata: file, todo, job, bookmarks, browser, etc.
- Nostr account profile
- Nostr git repository announcement metadata: <https://nips.nostr.com/34#repository-announcements>
- `README.md`
- `AGENTS.md`, if it includes public/product wording
- `package.json`
- Plugin templates or generated docs if they include AppWeaver public descriptions

## Naming decisions

- Keep the visible product name as `AppWeaver`.
- Use `getappweaver` for accounts and orgs where `AppWeaver` itself is unavailable or less practical.
- Use `getappweaver/core` for the main repo so first-party apps and docs can split into their own repos later.
- Prefer official plugin repos with short names ending in `-plugin`.
- Keep product surface names plain: AppWeaver Core, AppWeaver Apps, AppWeaver Docs, and AppWeaver Deploy if deployment convenience becomes a separate surface.
