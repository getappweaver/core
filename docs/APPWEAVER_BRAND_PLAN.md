# AppWeaver Brand Plan

## Brand Definition

### Name

`AppWeaver`

### Short descriptor

AI-powered micro application platform

### Expanded descriptor

AppWeaver is an open, self-hostable AI-powered micro application platform for automation, messaging, and installable apps.

### Positioning summary

AppWeaver is not just a chat bot and not just a plugin system. It is a web-first platform where users install micro apps, run AI-powered workflows, and interact through web, chat, and network-based interfaces like Nostr. Users can run it themselves, while AppWeaver Deploy provides optional convenience for setup and deployment.

## Core Messaging

### What AppWeaver should mean

- A platform, not a single-purpose bot
- A system that weaves small apps into one intelligent workspace
- Open and runnable by the user on their own infrastructure
- Self-hosted, extensible, and user-owned
- AI-native, but not limited to chat
- Ready for apps, automation, deployment convenience, and a plugin ecosystem

### Headline options

- Self-host your own AI micro app platform
- Install AI-powered apps into your own server
- A web-first platform for AI apps and automation
- Weave apps, automation, and messaging into one system

### Supporting copy options

- Start with the core, then install only the apps you want.
- Run AppWeaver yourself, or use AppWeaver Deploy for a faster setup path.
- Run todos, bookmarks, jobs, files, and future apps in one AI-powered platform.
- Control your system from the web, terminal, or Nostr.
- Build your own micro apps or install them from the ecosystem.

## Brand Architecture

Use one main product brand with predictable extensions.

### Main brand

- `AppWeaver`

### Product surface names

- `AppWeaver Core`
- `AppWeaver Plugins`
- `AppWeaver Deploy`
- `AppWeaver Market` if you later launch a plugin marketplace
- `AppWeaver Docs`

### Naming guidance

- Keep `AppWeaver` as the umbrella name
- Use plain descriptive suffixes for products and surfaces
- Do not create multiple unrelated sub-brands too early

## Domains

### Current asset status

- GitHub org secured: `getappweaver`
- Primary domain in progress: `getappweaver.com` via transfer from `binomus.com`
- Next accounts to secure: X, LinkedIn, Nostr

## Domain priorities

Buy the shortest clean domain you can get, then buy defensive variants.

### Primary domain targets

Try in this order:

1. `appweaver.com`
2. `appweaver.ai`
3. `appweaver.dev`
4. `appweaver.io`
5. `appweaver.app`

### Good fallback domains

- `getappweaver.com`
- `useappweaver.com`
- `appweaverhq.com`
- `appweavercloud.com`
- `appweaverplatform.com`

### Defensive domains worth considering

- `appweaver.net`
- `appweaver.org`
- `appweaver.co`
- common typo variants if cheap enough

### Recommendation

- Prefer `.com` if available and affordable
- If not, `.ai` or `.dev` are acceptable for this product
- If the main domain is unavailable, prefer `getappweaver.com` over awkward invented variants
- Since `getappweaver.com` and `getappweaver` are already being secured, use them operationally while keeping the visible product name as `AppWeaver`

## Social And Identity Handles

Try to standardize on one handle everywhere.

### Preferred handle order

1. `@getappweaver`
2. `@appweaver`
3. `@appweaverhq`
4. `@useappweaver`

### Accounts to secure early

- X
- GitHub org
- LinkedIn
- Nostr identity
- Telegram if you expect community support there
- Discord server vanity if you plan community growth
- YouTube for demos if you plan content

### Account naming rule

Use the same primary handle everywhere if possible. Avoid random variations like `@realappweaver`, `@appweaver_official`, or `@appweaverapp` unless forced.

## GitHub Strategy

### Recommended org name

- `getappweaver`

### Fallback org names

- `appweaver`
- `appweaverhq`

### Recommended repo structure

Main repo options:

1. `getappweaver/appweaver`
2. `getappweaver/core`

Recommendation:

- If the project remains a single main codebase, use `getappweaver/appweaver`
- If you expect multiple first-party repos soon, reserve `getappweaver/core` for the current repo and keep the product brand rooted in `AppWeaver`

### Plugin repo naming

Use predictable names:

- `appweaver-todo-plugin`
- `appweaver-bookmarks-plugin`
- `appweaver-jobs-plugin`
- `appweaver-file-plugin`

Or under org repos:

- `getappweaver/todo-plugin`
- `getappweaver/bookmarks-plugin`
- `getappweaver/jobs-plugin`
- `getappweaver/file-plugin`

### Recommendation

Prefer org repos with short names:

- `getappweaver/core`
- `getappweaver/todo-plugin`
- `getappweaver/bookmarks-plugin`
- `getappweaver/jobs-plugin`
- `getappweaver/file-plugin`
- `getappweaver/docs` if needed later

## Repo And Migration Plan

### Current challenge

The current project identity is tied to `nostr-dm-agent` or `nostr-dm-bot`, which no longer matches the broader product.

### Rename plan

1. Secure GitHub org and target repo names first
2. Secure domain and key social handles
3. Update the repo name and README
4. Update package names only where it makes product sense
5. Keep compatibility references where needed, but shift public branding to AppWeaver

### Public repo naming recommendation

Rename the main public repo to one of:

1. `appweaver`
2. `core`

My preference:

- GitHub org: `getappweaver`
- Main repo: `core`

That gives you:

- `github.com/getappweaver/core`

This scales better if you later split out:

- `github.com/getappweaver/web`
- `github.com/getappweaver/plugins`
- `github.com/getappweaver/docs`

## Website Structure

### Pages to launch first

1. Home
2. Plugins
3. Docs
4. Self-hosting
5. Build a plugin

### Pages to add later

1. Deploy
2. One-click deploy
3. Marketplace
4. Examples and templates
5. Pricing

### Naming note

- Use `AppWeaver Deploy` for one-click deployment, provisioning, and convenience hosting flows
- Keep the core message clear: AppWeaver remains open and self-hostable; Deploy is an optional convenience layer, not the only way to use the product
- Use `AppWeaver Docs` as the name of the documentation site or docs section, not as a separate product line

## Product Vocabulary

Standardize these words across site, docs, README, and UI.

### Use these terms

- Core
- Plugin
- Micro app
- Widget
- Command
- Channel
- Workspace
- Automation
- Self-hosted

### Avoid leading with these terms

- DM bot
- Nostr bot
- remote coding bot

Those should become feature descriptions, not the main identity.

## Launch Narrative

### Simple public explanation

AppWeaver is the evolution of the project from a Nostr DM bot into a web-first AI micro application platform.

### Transition message

Suggested public wording:

> AppWeaver is the new name for the project previously known as nostr-dm-agent. The product has evolved beyond DMs into an open, web-first platform for AI-powered micro apps, automation, and self-hosted workflows, with AppWeaver Deploy as an optional convenience layer.

## Marketing Angles

### Main angles to test

1. Self-hosted AI app platform
2. Installable AI micro apps
3. Web-first personal automation system
4. Bitcoin-native setup and hosting
5. Open plugin ecosystem for AI apps

### What to push first

Lead with:

- Web-first platform
- Installable micro apps
- Self-hosted ownership
- Open and runnable anywhere

Support with:

- Nostr support
- terminal chat
- AppWeaver Deploy for faster setup
- bitcoin-native hosting and setup

## Audience Segments

### Builders

- Plugin authors
- open-source developers
- indie hackers

Message:

> Build and publish micro apps that plug into a shared AI-powered core.

### Self-hosters

- homelab users
- VPS users
- technical operators

Message:

> Run your own AI app platform on infrastructure you control, with optional deployment convenience when you want it.

### Bitcoin and Nostr users

- people who care about ownership and open systems

Message:

> Use a platform that fits open networks, self-custody, and bitcoin-native deployment.

## Content Plan

### Immediate content

1. New homepage copy
2. Rewritten README
3. "Why AppWeaver" launch post
4. Plugin overview page
5. Build-your-first-plugin guide

### Good early demo content

1. Install Todo, Bookmarks, Jobs, and File into a fresh AppWeaver instance
2. Show the same system working over web and Nostr
3. Show how a plugin can own its own DB and still use shared AI services
4. Show a one-click deployment flow

## Social Launch Ideas

### Launch post structure

1. Old project name and limitation
2. Why the product outgrew the old brand
3. New name: AppWeaver
4. New framing: AI-powered micro application platform
5. Current official plugins
6. Future roadmap: web-first UI, push notifications, hosting, plugin ecosystem

### Short post examples

- AppWeaver is the new name for my project formerly known as nostr-dm-agent. It has evolved into an open, self-hostable AI-powered micro application platform with installable apps, web UI, Nostr support, and optional deployment convenience through AppWeaver Deploy.
- Building AppWeaver: a web-first platform for AI micro apps. Run it yourself, install apps like todo, bookmarks, jobs, and file management, and use AppWeaver Deploy when you want a faster setup path.

## SEO And Discoverability

### Primary phrases to target

- AI micro application platform
- self-hosted AI platform
- installable AI apps
- AI automation platform
- plugin-based AI app platform
- self-hosted agent platform

### Secondary phrases

- Nostr AI tools
- bitcoin-native AI hosting
- AI plugin system
- self-hosted personal automation

## Logo Direction

### AppWeaver visual story

The identity should show many smaller parts woven into a coherent whole.

### Good motif directions

- Interwoven lines
- Modular grid with connective threads
- Woven square or woven knot
- Subtle loom or weave pattern without becoming decorative craft branding

### Avoid

- Robot mascots
- chat bubbles as the main icon
- overly generic sparkles or AI stars

## Operational Checklist

### Phase 1: Secure the brand

1. Complete transfer for `getappweaver.com`
2. Buy one or two defensive domains
3. Secure GitHub org `getappweaver`
4. Secure X handle
5. Secure LinkedIn handle
6. Secure Nostr identity

### Phase 2: Prepare the public rename

1. Rewrite README headline and intro
2. Add rename note to README
3. Update project description in package metadata where public-facing
4. Create a simple landing page
5. Prepare launch thread or blog post

### Phase 3: Align the ecosystem

1. Rename official plugin repos
2. Update plugin docs and examples
3. Update screenshots and UI labels
4. Update website and docs nav
5. Update publish and install flows if naming appears there

### Phase 4: Expand distribution

1. Add one-click deploy pages
2. Add managed hosting offer
3. Add plugin publishing page
4. Build marketplace or directory story

## Recommendations

### Best practical move

Use this structure:

- Brand: `AppWeaver`
- Descriptor: `AI-powered micro application platform`
- GitHub org: `getappweaver`
- Main repo: `core`
- Primary domain target: `getappweaver.com`
- Product surfaces: `AppWeaver Plugins`, `AppWeaver Deploy`, `AppWeaver Docs`

### If the ideal assets are unavailable

Fallback stack:

- Domain: `getappweaver.com`
- Handle: `@getappweaver`
- GitHub org: `getappweaver`

Still keep the visible product name as `AppWeaver`.

## Open Questions

1. Do you want the public repo to be `getappweaver/appweaver` or `getappweaver/core`?
2. Should `AppWeaver Deploy` cover only one-click deployment at first, or also managed hosting later?
3. Do you want `Market` to exist early as a plugin directory, even before transactions?
4. Do you want Nostr to appear on the homepage hero, or lower on the page as one supported channel?
