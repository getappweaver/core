# Plugin System

AppWeaver supports plugins that extend the core with new commands, AI tools, and installable capabilities. Plugins are self-contained packages hosted on Nostr (via ngit) or GitHub, installed and managed via built-in scripts.

---

## For Plugin Users

### Installing a plugin

```bash
bun run plugin:install
```

This opens an interactive discovery flow:

1. Queries well-known Nostr relays for available plugins
2. Lists them with compatibility status against your AppWeaver core version
3. You pick one and choose a short **alias** (e.g. `todo`, `jobs`)
4. The plugin is cloned into `plugins/<alias>/`
5. `plugins.json` is updated
6. Plugin registration, the CLI tool registry, and generated skill docs are updated automatically

The alias you choose (or the user overrides) becomes the first token after your **DM command prefix** (default **`/`**, e.g. `/todo list`) and the folder name (`plugins/todo/`). Keep it short and memorable.

### Updating a plugin

```bash
bun run plugin:install todo
```

Pass the alias of an already-installed plugin. The script fetches the latest compatible version from the plugin's Nostr event, runs `git fetch --tags && git checkout <new-tag>` in the plugin folder, and re-runs the generators. Your plugin's database (`plugins/todo/db.sqlite`) is never touched.

### Listing installed plugins

Check `plugins.json` in the AppWeaver root:

```json
{
  "plugins": [
    {
      "alias": "todo",
      "repo": "nostr://npub1.../appweaver-todo-plugin",
      "version": "v1.0.1"
    }
  ]
}
```

### Using a plugin

Once installed, plugins register their commands under the alias you chose. Examples below use the default DM prefix **`/`**; substitute yours if you changed it in **`bun run bot:setup`**.

Run:

```
/todo help
```

to see available commands for that plugin. All plugin commands follow the same `<prefix><alias> <subcommand>` pattern (e.g. `/todo list`).

Plugin AI features work through your configured agent backend and the generated **skills** / **`bun src/cli.ts`** tool flow: each plugin exposes a `ToolCallSchema` in `ai.ts`, and `bun run plugin:generate` writes `.claude/skills/appweaver-<alias>/SKILL.md` when the plugin exports `ToolCallSchema` and `skillDescription`.

### Version compatibility

Each plugin declares which core major version it supports. If your AppWeaver core is on `5` and the plugin only has a ref for core `4`, the installer will warn you and offer to install the older compatible version, or suggest upgrading the core.

### Uninstalling a plugin

Currently manual:

1. Delete the `plugins/<alias>/` folder
2. Remove the entry from `plugins.json`
3. Run `bun run plugin:generate` to regenerate core registration and CLI/skill outputs

---

## For Plugin Authors

### Scaffolding a new plugin (local dev)

To start from the built-in template inside this repo:

```bash
bun run plugin:new
```

The script prompts for:

- **Alias** (required) — folder name and command token (e.g. `todo` → `plugins/todo/`, `/todo …` with default DM prefix)
- **Short description** (optional) — defaults to a sensible string from the alias
- **Core API version** (optional) — defaults from the current AppWeaver major version in root `package.json`

It copies `scripts/plugin-template/` into `plugins/<alias>/`, expanding placeholders (`{{ALIAS}}`, `{{PASCAL_ALIAS}}`, etc.). It can optionally run `eslint` with `--fix` **only** for that new folder.

**It does not** edit `plugins.json` or run `bun run plugin:generate`. After you’re ready to wire the plugin into this checkout:

1. Add an entry to `plugins.json`
2. Run `bun run plugin:generate` (registers the plugin and CLI/skill outputs)

For a distributable plugin, treat the scaffold as a starting point: finish features, then publish from its own git repo as described under [Publishing a plugin](#publishing-a-plugin).

### Plugin structure

A plugin is a git repository with this structure (matches `scripts/plugin-template/`):

```
my-plugin/
  package.json              ← metadata + coreApiVersion
  init.ts                   ← exports the BotPlugin object
  adapter.ts                ← parseCliInput + dispatch to command adapters
  definition.ts             ← aggregated CommandDefinition
  ai.ts                     ← ToolCallSchema, executeTool, skillDescription
  format.ts                 ← display helpers
  reply-tone.ts             ← tone hints for plain-text replies (optional pattern)
  renderers/text.ts         ← render*Text + shared representation union
  __BOTTOMUP.md             ← optional; scope_root for appweaver-file bottom-up docs
  commands/
    help/module.ts          ← get*CommandDefinition + get*HelpLines
    help/adapter.ts
    <subcommand>/definition.ts
    <subcommand>/adapter.ts
    …                       ← e.g. list/renderers/web.ts for optional WebNodeRoot
  db/
    open.ts
    entities.ts             ← table + CRUD (names vary)
    drafts.ts               ← draft table + helpers (if using draft flow)
    index.ts                ← re-exports for `import … from './db'`
  output/message/           ← message representation + text renderer (optional pattern)
  types/                    ← Zod schemas and TypeScript types
    index.ts
    item.ts
    draft.ts
  README.md
  .gitignore
```

Older in-tree plugins may add `output/`, web renderers, or extra `db/` modules; both flat and split `types/` layouts are valid.

### `package.json`

```json
{
  "name": "appweaver-todo-plugin",
  "version": "1.0.1",
  "description": "Todo management plugin for AppWeaver",
  "dmBot": {
    "coreApiVersion": "5",
    "description": "Todo management plugin for AppWeaver"
  }
}
```

- `dmBot.coreApiVersion` — bot core major version (or range) this release supports; used by the installer for compatibility.
- `dmBot.description` — short description used in plugin help and when publishing to Nostr; required for registration.

### `init.ts` — the plugin object

Every plugin exports a `BotPlugin` object:

```typescript
export let PluginDb: Database | null = null;
export let PluginContext: PluginContext | null = null;

export const ExamplePlugin: BotPlugin = {
  identity: {
    name: 'appweaver-example-plugin',
    alias: 'example',
    version: '1.0.0',
    description: '…',
  },
  onInit(ctx: PluginContext): void {
    PluginContext = ctx;
    PluginDb = openDb();
  },
  handler(
    args: string[],
    context: PluginInvocationContext,
  ): Promise<HandlerResult> {
    if (!PluginContext || !PluginDb) throw new Error('Plugin not initialized');
    return handleExampleAdapter({
      args,
      prefix: context.prefix,
      alias: 'example',
      db: PluginDb,
      source: context.source,
      identity: ExamplePlugin.identity,
      storedCtx: PluginContext,
      runAgent: context.runAgent,
    });
  },
  helpText(alias: string, prefix: string): string[] {
    return [`…`, …getExampleHelpLines(prefix, alias)];
  },
  commandDefinition: (prefix: string, pluginAlias: string) =>
    getExampleCommandDefinition(prefix, pluginAlias),
};
```

- **onInit(ctx)** — called once at AppWeaver startup. Store `ctx` in a module-level variable; open your plugin DB (e.g. `plugins/<alias>/db.sqlite`) and run migrations. The core does not pass a database — you create and own it.
- **handler(args, context)** — called for each `<prefix><alias> …` command. Use `PluginInvocationContext` (`source`, `runAgent`, optional `sendReply` / `promptFn`) together with the DB and stored `PluginContext`.
- **helpText(alias, prefix)** — returns an array of help lines shown under the plugin in **`/help`** (using the user’s configured DM prefix). Identity `description` is used in the plugin list.
- **commandDefinition** — structured subcommands for `parseCliInput` and global `help <alias>` integration.

### `ai.ts` — AI/CLI tool definitions

Plugins expose AI/CLI tool calls via:

- **`ToolCallSchema`** (named export from `ai.ts`) — a Zod discriminated union keyed by `type`
- **`skillDescription`** (export from `ai.ts`) — short string for the generated skill frontmatter (required for skill generation)
- **`executeTool({ alias, call, db })`** (export from `ai.ts`) — executes one validated tool call
- **`agentInstructions(alias)`** (optional export from `ai.ts`) — extra prose prepended to generated `.claude/skills/appweaver-<alias>/SKILL.md` (omit it when the JSON schema + shared skill rules are enough)

`src/cli.ts` validates incoming JSON with `ToolCallSchema`, injects `type` from `<toolName>`, then calls `executeTool`.

Plugins are allowed to differ in **which** tools they expose, how `<prefix><alias> ai` is implemented, and how `executeTool` applies domain rules. What must stay consistent is the **exports above** so `plugin:generate` and the CLI keep working. For **new** plugins, start from `bun run plugin:new` — `scripts/plugin-template/` is kept in sync with that contract.

### The draft/confirm flow

Plugins that mutate data should use a draft/confirm pattern — the AI proposes a change, the user reviews and accepts it via a command. This prevents unintended modifications:

1. Tool `execute` calls `storeDraft(db, { kind, input, originalPrompt })` and returns a formatted preview with a Draft ID.
2. User runs a confirm subcommand (e.g. `<prefix><alias> confirm <id>` to apply, `<prefix><alias> revise <id> <corrections>`, or `<prefix><alias> discard <id>` to cancel).
3. The `handler` in `init.ts` dispatches these subcommands.

### Publishing a plugin

#### 1. Tag your release

Bump the version in `package.json`:

```json
{
  "version": "1.0.1"
}
```

Then tag and push:

```bash
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

#### 2. Publish the Nostr event

```bash
bun run plugin:publish
```

This reads your `package.json`, fetches the existing kind `32107` event from relays (if any), appends the new ref, and republishes. You sign with a NIP-46 bunker — your key never leaves your signer app.

The published event looks like:

```json
{
  "kind": 32107,
  "tags": [
    ["d", "appweaver-todo-plugin"],
    ["description", "Todo management plugin for AppWeaver"],
    ["version", "v1.0.1"],
    ["coreApiVersion", "5"],
    ["t", "appweaver-plugin"],
    ["ref", "v1.0.0", "5", "Initial release"],
    ["ref", "v1.0.1", "5", "Fix parent_id coercion"]
  ]
}
```

Each `ref` tag carries the git tag, the supported core major, and a changelog line. Multiple refs coexist — older versions remain installable by users on older bot versions.

#### Supporting multiple core major versions

If you want to support both core `4` and core `5`:

```json
["ref", "v1.2.3", "4", "last release for core 4"]
["ref", "v2.0.0", "5", "core 5 support"]
```

Users on core `4` will get `v1.2.3`, users on core `5` will get `v2.0.0`. The installer picks the latest compatible ref automatically.

### Code generation

AppWeaver refreshes plugin registration, CLI registry, and skill docs when you run `bun run plugin:install` or `bun run plugin:generate`:

**`generated/plugins.ts`** — registers all installed plugins at AppWeaver startup:

```typescript
// AUTO-GENERATED
import { registerPlugin } from '../src/core/registry';
import type { PluginContext } from '../src/core/plugin';
import { TodoPlugin } from '../plugins/todo/init';

export function registerPlugins(ctx: PluginContext): void {
  registerPlugin({ plugin: TodoPlugin, ctx });
}
```

**`generated/cli-registry.ts`** — AUTO-GENERATED; imports each plugin’s `ToolCallSchema` from `plugins/<alias>/ai.ts` and exposes alias/schema metadata for `src/cli.ts`.

**`.claude/skills/appweaver-<alias>/SKILL.md`** — AUTO-GENERATED skill docs for CLI-based tool usage (generated when the plugin exports `ToolCallSchema`, `skillDescription`, and passes the generator’s schema checks).

Paths such as `.claude/skills/appweaver*/` and `generated/` may be gitignored locally; run `bun run plugin:generate` after clone or template changes. Keep `plugins.json` private as today.

#### SQLite WAL

Plugins open `plugins/<alias>/db.sqlite` through `openDb()` in `db.ts` and run `PRAGMA foreign_keys = ON` plus `PRAGMA journal_mode=WAL`, so AppWeaver commands and CLI calls share one DB setup path.

### NIP-05 and npub repo URLs

Plugin repo URLs support both formats:

- `nostr://npub1abc.../appweaver-todo-plugin` — direct npub
- `nostr://_@yourdomain.com/appweaver-todo-plugin` — NIP-05 identity

The installer resolves NIP-05 identities via `.well-known/nostr.json?name=<name>` automatically.
