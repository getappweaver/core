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

### Remote (Future)

- Nostr-based plugin discovery
- Install from npub
- Verify signed manifests

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

Landing pages are built from `apps/landing/src/landing-data.ts` and rendered by
`apps/landing/src/plugin-pages.tsx`. For example, PayPerQ lives at `/apps/ppq`.

1. Give the plugin a local SVG icon and set `appweaver.icon` in
   `plugins/<alias>/package.json` (for example, `"./ppq.svg"`). Register the
   plugin in `plugins.json` if it is not already listed. From `apps/landing`, run
   `bun run apps:icons`. This reads each registered plugin's manifest and copies
   its icon to `apps/landing/public/plugin-icons/<alias>/<filename>`.
   `bun run demo:copy` also copies the icons along with the web demo assets, but
   requires an embedded `web/dist` when that directory exists.
2. Add an `OfficialApp` entry in `apps/landing/src/landing-data.ts`: set the
   route (`href: '/apps/<slug>'`), package name, repo, display names, description,
   feature bullets, and `hasInteractiveDemo`. Add its icon path in
   `apps/landing/src/official-app-grid.tsx`. If the route slug differs from the
   command alias, add a mapping in `pluginRouteAliases` in
   `apps/landing/src/plugin-pages.tsx`.
3. Add the route to `appRoutes` in `apps/landing/vite.config.ts` so both dev and
   preview serve it. Optionally add a custom title and description in
   `pluginPagePresentations` in `plugin-pages.tsx`. A plugin with a header/right
   web widget can set `hasInteractiveDemo: true` and show the embedded demo.
   A model-source plugin without such a widget (like PPQ) should set it to
   `false`; the page then shows its features without an empty demo panel.
   For an install screenshot, place `<slug>.png` in
   `apps/landing/public/plugin-install/` (for example, `ppq.png`) and set
   `installScreenshotSlug: '<slug>'` in its `OfficialApp` entry. The page's
   `pluginInstallScreenshotSlugs` map can also supply the slug, but an explicit
   `installScreenshotSlug: null` **hides the screenshot** even if the file and
   map entry exist. Use `null` only if there is no screenshot; this uses the
   plugin icon for social previews instead.
4. If the plugin has interactive demo commands, refresh the demo assets with
   `bun run demo:generate` from the repository root, build the embedded web
   demo with `bun run web:demo:build`, then run `bun run demo:copy` from
   `apps/landing`. The landing page reads command metadata from
   `apps/landing/public/demo/commands.json` to select the widget.
5. From `apps/landing`, run `bun run build` after adding or replacing screenshots.
   Vite copies `public/plugin-install/<slug>.png` into `dist/plugin-install/`;
   a preview or deployed site serving an older `dist` will not show the new
   image until rebuilt. The build also syncs manifest icons, builds the site,
   and runs `bun run apps:build` (the script at
   `apps/landing/scripts/generate-plugin-pages.ts`). It creates
   `dist/apps/<slug>/index.html` with page-specific metadata and a static
   fallback. Open the route in preview to confirm the icon, feature copy,
   installation section, and any interactive demo.
