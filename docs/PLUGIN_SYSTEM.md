# Plugin System Specification

## Overview

Extensible plugin architecture for AppWeaver. Core features (todos, jobs, tasks) are first-class plugins. Third-party plugins can be installed separately.

## Core Concepts

### Plugin

A self-contained module that provides capabilities and handles commands.

### Capability

A named feature a plugin provides (e.g., `todos`, `jobs`, `git`). Versioned.

### Command

A user-invokable action, exposed by plugins.

## Plugin Structure

```
my-plugin/
├── manifest.json      # Metadata, dependencies, capabilities
├── src/
│   ├── index.ts       # Plugin entry point
│   ├── commands/      # Command handlers
│   └── capabilities/ # Capability implementations
└── ui/                # Optional UI specs (declarative)
```

### manifest.json

```json
{
  "name": "jobs",
  "version": "1.2.0",
  "description": "Job tracking and management",
  "author": "bot-core",
  "apiVersion": "1.0.0",

  "provides": [
    { "name": "jobs", "version": "1.0.0" }
  ],

  "requires": [
    { "name": "storage", "version": ">=2.0.0" },
    { "name": "ai", "version": "^1.0.0" }
  ],

  "commands": [
    {
      "name": "job list",
      "inputMode": "direct",
      "description": "List all jobs"
    },
    {
      "name": "job create",
      "inputMode": "form",
      "ui": { "fields": [...] }
    }
  ],

  "capabilities": {
    "uiComponents": ["actionButton", "expandable", "list"]
  }
}
```

## Versioning Strategy

### API Version (semver)

Bot declares supported plugin API version. Plugins declare required version.

```
apiVersion: "1.0.0"  // Plugin requires
botSupports: "^1.0.0" // Bot declares
```

Compatibility: Plugin's required version must fall within Bot's supported range.

### Plugin Version

Each plugin versions independently. Follows semver (major.minor.patch).

### Capability Version

Each capability has version. Allows incremental capability changes.

```typescript
{
  name: 'todos',
  version: '1.2.0',  // Capability version, separate from plugin version
}
```

### Data Schema Version

Storage layer versions data structures. Migrations handled by storage plugin.

## Capability System

### Declaration

Plugins declare what they provide and what they need.

```typescript
// Plugin A
provides: [{ name: 'storage', version: '2.0.0' }];
requires: [];

// Plugin B
provides: [{ name: 'todos', version: '1.0.0' }];
requires: [{ name: 'storage', version: '>=2.0.0' }];
```

### Resolution

At startup, Bot resolves dependency graph:

1. Collect all plugins
2. Check capability compatibility
3. Warn on missing dependencies
4. Warn on version conflicts
5. Load in dependency order

### Built-in Capabilities

| Capability | Description                           |
| ---------- | ------------------------------------- |
| `storage`  | Key-value persistence with versioning |
| `ai`       | AI inference interface                |
| `nostr`    | Nostr message send/receive            |
| `commands` | Command registration                  |
| `ui`       | UI component rendering                |

## Command Interface

### Handler Signature

```typescript
interface CommandHandler {
  (ctx: CommandContext): Promise<CommandResult>;
}

interface CommandContext {
  userId: string;
  botId: string;
  args: string[];
  raw: string;
  capabilities: Map<string, any>;
}

interface CommandResult {
  type: 'text' | 'form' | 'preview' | 'error';
  content: string;
  ui?: UiSpec;
}
```

### Form UI Spec

```typescript
interface FormSpec {
  fields: FieldSpec[];
  submitLabel?: string;
}

interface FieldSpec {
  name: string;
  type: 'text' | 'textarea' | 'url' | 'number' | 'select' | 'checkbox';
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[]; // For select
  default?: any;
}
```

### Preview UI Spec

```typescript
interface PreviewSpec {
  content: string;
  actions: ActionSpec[];
}

interface ActionSpec {
  label: string;
  command: string; // Supports {var} interpolation
}
```

## UI Components (Declarative)

Plugins return UI specs, NOT code. Client interprets and renders.

### Supported Components

- `actionButton`: Tap triggers command
- `expandable`: Collapsed/expanded sections
- `statusCard`: Summary + actions
- `list`: Tappable rows
- `codeBlock`: Syntax-highlighted code

### Example: Job Card (from jobs plugin)

```json
{
  "type": "preview",
  "content": "Senior Engineer @ Acme\n$150k/yr",
  "actions": [
    { "label": "Apply", "command": "/job apply {id}" },
    { "label": "Edit", "command": "/job edit {id}" }
  ]
}
```

Client renders as rich card on mobile, text + buttons in terminal.

## Plugin Lifecycle

```
Loading → Resolving Dependencies → Initializing → Running
     ↓
  Unloading (on disable/uninstall)
```

### Initialization

```typescript
interface Plugin {
  init(ctx: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
}

interface PluginContext {
  getCapability(name: string): any;
  registerCommand(cmd: CommandSpec): void;
  storage: StorageCapability;
}
```

## Security

- **No code execution**: UI specs are declarative data
- **Capability sandboxing**: Plugins only access declared capabilities
- **Command validation**: All commands validated before execution
- **Storage isolation**: Plugins access only their own data namespace

## Migration: Existing Features

### Todos → Plugin

1. Extract to `plugins/todos/`
2. Create manifest.json
3. Define capabilities: `todos`
4. Add UI specs for forms/previews

### Tasks/Jobs → Plugin

1. Extract to `plugins/jobs/`
2. Create manifest.json
3. Define capabilities: `jobs`, `job-ai`
4. Add AI-specific command handlers

### Commands → Plugin

Each command family becomes a plugin:

- `plugins/todos` - `/todo *`
- `plugins/jobs` - `/job *`
- `plugins/git` - `/git *`

## Plugin Registry

### Local (Development)

```json
{
  "plugins": {
    "todos": { "enabled": true, "path": "./plugins/todos" },
    "jobs": { "enabled": true, "path": "./plugins/jobs" }
  }
}
```

### Remote catalog: Nostr kind `32107`

The plugin manager publishes and discovers author-signed, addressable catalog
events of kind `32107`. The publisher and installer use the same event format;
they do not define separate event kinds. See the
[plugin manager commands](../src/commands/plugin-manager/README.md),
[publisher](../src/commands/plugin-manager/publish/handler.ts), and
[catalog reader](../src/commands/plugin-manager/install/handler.ts).

The stable catalog coordinate is `32107:<author-pubkey>:<package-name>`, where
`<package-name>` is the `d` tag. Publishing an update produces a new signed event
with a new event ID at that coordinate; it does not edit the previous signed
event. Relays may retain only the latest replacement, so the catalog is not an
immutable release or purchase-terms archive.

`content` contains the plugin description. The publisher emits these tags:

| Tag | Values after the tag name | Purpose |
| --- | --- | --- |
| `d` | Package name | Stable identifier within the publishing author's catalog. |
| `title` | Display title | Human-readable app name. |
| `icon` | Published icon URL, optional local SVG path | Optional icon and its source path. |
| `website` | Website URL | Optional app website. |
| `repo` | Repository address | Git installation source, including supported `nostr://` repository addresses. |
| `version` | Version tag, e.g. `v1.2.0` | Current published version. |
| `coreApiVersion` | Required core API version | Current version's compatibility declaration. |
| `t` | `appweaver-plugin` | Catalog discovery marker. |
| `ref` | Git tag, core API version, changelog | Repeated release entries used for compatible-version selection and update output. |
| `offer` | Kind `8107` event ID, relay URL | Optional advertised payment offer, managed independently of releases. |
| `L` | `com.getappweaver.capability` | Capability label namespace, emitted when capability labels exist. |
| `l` | Capability label, namespace | Repeated labels for `provides`, `uses`, and `requires`. |

Capability labels have the form
`com.getappweaver.capability:<relation>:<capability-name>:v<version>`, e.g.
`com.getappweaver.capability:provides:todos:v1`. Their namespace is
`com.getappweaver.capability`.

For example, the unsigned event fields before author signing are:

```json
{
  "kind": 32107,
  "created_at": 1791417600,
  "tags": [
    ["d", "appweaver-example"],
    ["title", "Example App"],
    ["repo", "https://example.com/author/example-app.git"],
    ["version", "v1.2.0"],
    ["coreApiVersion", "1.0.0"],
    ["t", "appweaver-plugin"],
    ["L", "com.getappweaver.capability"],
    ["l", "com.getappweaver.capability:provides:todos:v1", "com.getappweaver.capability"],
    ["ref", "v1.2.0", "1.0.0", "Release notes"]
  ],
  "content": "Example app description."
}
```

Discovery queries kind `32107` with `#t: ["appweaver-plugin"]`, optionally
restricting authors or filtering capability labels with `#l`. The reader ignores
entries without `d` or `repo` and selects the newest observed `created_at` for
each author/package pair. Publication uses the signing author's NIP-65 write
relays together with the plugin manager's fallback catalog relays.

### Payment offers: Nostr kind `8107`

The author publication manager supports immutable payment offers, signed by the
author of the app coordinate. The catalog advertises an offer through
`["offer", "<event-id>", "<relay-url>"]`. Publishing another offer does not edit
or invalidate earlier offers. Release publication preserves this pointer.

An offer has empty `content` and these singleton tags:

| Tag | Values after the tag name | Contract |
| --- | --- | --- |
| `a` | `32107:<author-pubkey>:<package-name>` | App identity; author must match the offer signer. |
| `type` | `one-time` | Purchase includes all future versions. |
| `price` | Positive integer, `sat` | Exact invoice price in sats. |
| `p` | Author pubkey | Initial implementation requires the author as recipient. |
| `lud16` | Lightning address | Author's zap-enabled payment destination. |
| `nostrPubkey` | Provider receipt-signing pubkey | Resolved from LNURL metadata and pinned for historical validation. |
| `validFrom` | Unix seconds | Inclusive start of the purchase window. |
| `validUntil` | Unix seconds | Exclusive end, later than `validFrom`. |

The author manager validates endpoint zap support, provider key, and amount
limits before signing/publishing. It publishes the offer before replacing the
catalog pointer, and retains the signed offer locally for retries. The manager
can also advertise an existing unexpired author offer without a release.

The managed installer now gates installs/reinstalls/updates on qualifying
ownership while an advertised offer is active, without disabling installed apps.
Upcoming and expired offers allow installation without payment. Unavailable or
malformed advertised offers require recovery or correction. An `[i]` modal
explains the terms; payment identity selection is explicit.

Buyer-signed kind `9734` zap requests reference the app with `a`, the immutable
offer with `e` (including a relay hint), the recipient with `p`, the exact price
in millisats with `amount`, and receipt publication destinations with `relays`.
They are sent to the author's LNURL callback, not published as public requests.
Receipt qualification verifies both signatures, buyer/app/offer/recipient,
provider key pinned in the offer, exact BOLT11/request amount, invoice description
hash, and `validFrom <= receipt.created_at < validUntil`. An optional uppercase
receipt `P` must match the buyer if supplied; discovery does not require it.

New purchase requests include a server-generated `nonce` for the payment attempt.
The selected browser identity or bunker signs the request; core payments handles
the invoice and explicit payment approval. Receipt/offer records are retained
for historical recovery and revalidated on reuse. Pending requests/invoices
retain their original relays and provide rechecks without automatic repayment.
Restoration, including cached receipts, requires an unpublished challenge signed
by the buyer identified in the receipt's embedded zap request. A server nonce
binds the app, buyer, and receipt, expires after five minutes, and is consumed
atomically once. Browser and selected bunker identities use the same validation.
A saved connection or public receipt alone cannot grant restored paid access.
See [Plugin Payments Plan](PLUGIN_PAYMENTS_PLAN.md) for verification status,
phase-2 historical free versions, and remaining recovery decisions.

## File Structure

```
.opencode/
├── plugins/
│   ├── todos/
│   │   ├── manifest.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── commands/
│   │       └── storage/
│   └── jobs/
│       ├── manifest.json
│       └── src/
│           ├── index.ts
│           ├── commands/
│           └── ai/
├── plugin.json        # Registry config
└── capabilities/      # Built-in capability interfaces
```

## Open Questions

1. **Plugin distribution**: Local only, or Nostr-based registry?
2. **Hot reload**: Support during development?
3. **Plugin dependencies**: How to handle circular deps?
4. **Migration**: How to handle user data when plugin updates schema?
5. **Discovery**: How do users find available plugins?

## Add a plugin landing page

Plugins own their landing content; the landing app owns generic rendering and
static generation. For example, PayPerQ's `landing.ts` declares `/apps/ppq`.

1. Register the local plugin in `plugins.json`. Set the package name and local
   `appweaver.icon` SVG path in the plugin's `package.json`.
2. Export a data-only `landingPage` from `plugins/<alias>/landing.ts`, typed with
   `PluginLandingDefinition` from `apps/landing/content-types.ts`. Define its
   route, names, description, features, demo metadata, presentation, and roadmap
   target there. No central route/icon/copy mappings are required.
3. Keep screenshots and GIFs in the plugin's `landing/assets/` directory. Refer
   to them with plugin-root-relative paths. Set `installScreenshot: null` when
   unavailable. `assetAliases` can preserve existing `/screenshots/...` URLs
   referenced by published articles while the source image stays plugin-owned.
4. Keep plugin documents in the plugin's `docs/`. Use ordinary relative Markdown
   links to core documents, e.g. `[Web renderer](../../../docs/WEB_RENDERER.md)`
   from a plugin document, so both local readers and the generator can follow it.
5. Run `bun run --cwd apps/landing build`. It generates explicit content imports,
   copies plugin icons/media into `public/plugin-assets/`, generates static docs,
   builds the site, and writes `dist/apps/<slug>/index.html` with app-specific SEO
   and fallback content. All steps are local; deployment uses the maintainer's
   existing Vercel CLI workflow.

For interactive demos, retain the existing root `demo:generate` and
`web:demo:build` workflow, then run landing's `demo:copy`. The page uses generated
demo command metadata to select the embedded widget. The reusable demo engine
remains core-owned; plugin fixtures and story definitions remain plugin-owned.

See the [landing author guide](../apps/landing/README.md) for generator details.
