# dm-bot plugin tools

This repo uses a CLI-based tool system for AI agents.

## How to call tools

Each plugin exposes tools via bash:

\`\`\`bash
bun src/cli.ts <alias> <toolName> '<json>'
bun src/cli.ts <alias>              # print full JSON schema for plugin
bun src/cli.ts                      # list all plugins and tools
\`\`\`

## Draft system

All mutating operations (create, update, delete) return a **draft** for user review.
The user accepts/revises/declines via bot DM commands shown in the tool output.
Never retry a mutating tool if it returned a Draft ID.

## Skills

**All** official agent guidance for this repo lives under `.claude/skills/`. When you work in this workspace, **read every skill** in that directory.

Each skill is a folder: `.claude/skills/<skill_name>/SKILL.md` (OpenCode-compatible YAML frontmatter with `name` matching `<skill_name>`).

## Web command UI

Rich command output uses `WebNodeRoot` and optional per-render `stylesheets` (Shadow DOM). See `docs/WEB_RENDERER.md` (section “Scoped styles”).

### No plugin code under `src/` or `web/`

`src/` (bot core, shared `WebNode` schema, Nostr, etc.) and `web/` (the web app) must stay **plugin-agnostic**. Do not add imports from `plugins/`, command-plugin–specific types, `WebElementTag` / `WebProps` values, renderer branches, or comments that exist only to support one plugin. Plugin behavior belongs under `plugins/` (renderers, adapters, definitions). The Web UI wire format is still **JSON** (`WebNodeRoot` / `WebNode`); the web app only implements **generic** tags and `WebAction` handling once. If a feature needs a new building block, add a **reusable** primitive in `src/web/ui-schema.ts` and the client renderer, not a one-off for a given plugin. See `docs/WEB_RENDERER.md` (e.g. “Scoped styles”) for the renderer model.

---

## Tool permissions and workspace boundary

### Active agent permissions

- Tool permissions are enforced by the active agent runtime.
- For OpenCode agents, the source of truth is `.opencode/agents`. Follow the active agent profile there instead of adding an extra approval layer from this file.
- Do not ask for approval just because a command is not listed in this document. If the active runtime permits the tool/command, you may run it.
- If the active runtime denies a tool/command, do not try to bypass it.

### Long commands

- If the command is very long (e.g. a `cat` heredoc that writes a large file), summarize it without losing intent. For example write `CAT <new python script content>` or `WRITE <path> <description of content>` instead of pasting the full content. The user must still understand what would run.

### Fallback safe commands

If the active runtime does not provide more specific command permissions, these commands are considered safe to run without asking.

**Package scripts (trusted by project config)**

- `bun run <script>` when `<script>` exists in the nearest `package.json` `scripts` field.
- `bun test` when backed by package scripts or default bun test behavior.
- `bun run` (list scripts only, read-only).

Before running a package script, the agent should:

1. Read `package.json`.
2. Verify the script name exists.
3. Run only that script command (no extra shell chaining like `&&`, `;`, or pipes unless user explicitly approves).

**Common read-only commands**

- `bun --version`
- `ls`, `pwd`, `cat` for reading files
- `git status`, `git diff`, `git log`

**Read-only plugin CLI calls**

- `bun src/cli.ts` to list plugins/tools.
- `bun src/cli.ts <alias>` to print a plugin schema.
- `bun src/cli.ts <alias> list '<json>'` for read-only list tools.
- `bun src/cli.ts <alias> show '<json>'` for read-only show tools.
- `bun src/cli.ts <alias> context '<json>'` for read-only context tools.
- Other plugin CLI calls are allowed when the active runtime permits mutation-capable commands. Mutating plugin calls usually return drafts for user review; never retry a mutating tool if it returned a Draft ID.

### Destructive and sensitive commands

- NEVER run destructive or sensitive commands (e.g. `rm -rf`, overwriting credentials, changing system config) without explicit user approval. Even `rm -rf` is allowed **after** the user approves. Do not run them until the user has confirmed.

### Agent workspace boundary

- You may only create, edit, or delete files under the **workspace** (project root). The workspace is set when the agent is invoked (e.g. one level up from the dm-bot directory). NEVER modify files outside that tree.

---

## Commits

Before making a commit, include a version bump flag in the commit message:

- `--patch` — bug fixes, small improvements (e.g. `fix: description --patch`)
- `--minor` — new features, backward-compatible (e.g. `feat: description --minor`)
- `--major` — breaking changes (e.g. `chore: breaking change --major`)

Example: `git commit -m "chore: remove unused file --patch"`

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup (hooks, semver) and more.

---

## TypeScript: function parameters (3+ arguments)

When writing a function that takes **more than 2 parameters**, use a single **object parameter** and define a **named type** for its properties.

### Pattern

```ts
type MyFunctionProps = {
  foo: string;
  bar: number;
  baz: boolean | null;
};

function myFunction({ foo, bar, baz }: MyFunctionProps): ReturnType {
  // ...
}
```

### Requirements

- **Do not** use optional properties (`?` in TypeScript) on the props type.
- **Do not** use default parameters (e.g. `= null`) for the object’s properties.
- Callers must **always pass every property**. If a value is absent, the caller must explicitly pass `null` (or `undefined` where the type allows it).

This keeps call sites explicit and forces every caller to acknowledge every argument.

### Example (from codebase)

```ts
type ParseModelProps = {
  dmBotRoot: string;
  mode: AgentMode;
  modelOverride: string | null | undefined;
  providerName: ProviderName | null;
};

function parseModel({ dmBotRoot, mode, modelOverride, providerName }: ParseModelProps): string {
  // ...
}
```

---

## Post-agent lint behavior (agent mode)

When the bot runs in `agent` mode:

- After each agent response, the bot runs `bun run lint` for the active workspace target (`parent` or `bot`).
- The lint result is appended to the response sent to the user.
- If lint fails, the bot performs one additional agent round and sends lint output as feedback.
- The user receives the combined output after this lint step (and optional fix round).

### Agent expectations

- Assume lint may run immediately after your response in `agent` mode.
- If you receive a follow-up message prefixed with `[Post-edit lint feedback]`, treat it as authoritative runtime feedback and fix issues directly.
- Provide a concise final summary after applying lint-driven fixes.

---

# dm-bot codebase context

When editing or extending the dm-bot (NIP-17 DM bot), use this as the map. The bot forwards Nostr DMs to an agent CLI (Cursor or OpenCode) and sends replies back.

## File map

| File | Purpose |
|------|---------|
| `index.ts` | Main entry: env, SQLite, Nostr pool, subscription (kind 1059), command handling, agent backend dispatch, DM sending. Version computed at startup with `git rev-parse HEAD` from the project root. |
| `scripts/run-with-restart.ts` | **`bun run watch`**: runs the Bun bot + optional Vite (`WATCH_WEB_UI=0` to disable). Restarts the **bot only** when `restart.requested` is created/touched — **not** on every code save. Use that file so agents and humans pick a deliberate restart point. |
| `package.json` | Scripts: `start` (bot), `watch` (bot + watcher above), `web:dev` / `web:build`, `lint`. Deps: nostr-tools, @types/bun. |
| `.env.example` | Template for BOT_KEY, BOT_MASTER_PUBKEY, BOT_RELAYS, BOT_OPENCODE_SERVE_URL, DEBUG. |
| `opencode.json` | OpenCode project config: defines `ask`, `plan`, `build` agents with per-agent models and permissions. |

## State and persistence

- **SQLite** at `dm-bot.sqlite` (same dir as `index.ts`):
  - `seen_events(id)` – event ids already processed (avoids duplicate on restart).
  - `sessions(id, created_at, backend)` – agent session IDs with backend tag (`cursor` or `opencode`).
  - `session_messages(session_id, role, content, created_at)` – conversation history per session.
  - `state(key, value)` – key/value; keys include:
    - `current_session_id` – active session ID
    - `default_mode` – `ask` | `plan` | `agent`
    - `agent_backend` – `cursor` | `opencode`
    - `reply_transport` – `remote` | `local`
    - `workspace_target` – `parent` | `bot`
- **Restart signal**: file `restart.requested` in the project root. Create/touch it to restart the bot when using `watch`; the watcher removes it and restarts the process. There is **no** auto-restart on file edits — that is intentional.

## Agent backends

Two backends are supported, switchable at runtime via `!backend cursor|opencode`. State persisted in DB.

### Cursor backend (default)
- Invokes `agent create-chat` to create sessions (returns a UUID)
- Runs messages via: `agent -p --model auto --workspace <cwd> --trust --yolo [--mode=ask|--mode=plan|-f] --resume <sessionId> <content>`
- Session IDs are UUID v4 format

### OpenCode backend
- Creates sessions by running first message and parsing JSONL output for `sessionID`
- Runs messages via: `opencode run <content> --format json --session <id> --agent <ask|plan|build>`
- If `BOT_OPENCODE_SERVE_URL` is set, adds `--attach <url>` to all calls
- Session IDs are `ses_XXX` format
- Output is JSONL; parser collects `type:text` events and accumulates tokens/cost from `type:step_finish`

### Mode → agent mapping (OpenCode)
| dm-bot mode | OpenCode `--agent` | Model (in opencode.json) |
|---|---|---|
| `!ask` | `ask` | `ppq/google/gemini-2.5-flash-lite` |
| `!plan` | `plan` | `ppq/claude-opus-4.5` |
| `!agent` | `build` | `ppq/claude-sonnet-4.5` |

## ANSI colors (local terminal only)

Colors are applied for local terminal output and stripped (`stripAnsi()`) before sending over Nostr.

| Element | Color |
|---------|-------|
| `<ask>` prefix | cyan |
| `<plan>` prefix | yellow |
| `<agent>` prefix | green |
| Backend name | magenta |
| `[bot]` / `[sent]` | dim / blue |
| Errors | red |
| Token/cost footer | gray |

## Where to change what

- **New `!` commands**: In `index.ts`, function `handleBangCommand`. Add a new `if (cmd === "my-cmd") { ... return "reply"; }`. The function now receives `workspaceRoot`, `dmBotRoot`, and `agentEnv` for commands that need to create sessions.
- **Agent backends**: `CursorBackend` and `OpenCodeBackend` classes implement `AgentBackend`. Add new backends by implementing the interface and registering in `createBackend()`.
- **JSONL parsing**: `parseOpenCodeJsonl()` handles OpenCode `--format json` output. Accumulates tokens across multiple steps.
- **Workspace targeting + auto session reset**: `!workspace [parent|bot]` sets the active workspace target and auto-creates a new session on change.
- **Backend switching + auto session reset**: `!backend [cursor|opencode]` sets the active backend and auto-creates a new session on change.
- **Post-agent lint flow (agent mode)**: After an `agent`-mode run, bot runs `bun run lint` for the active workspace; on lint errors, performs one additional agent round with lint feedback.
- **Reply formatting / chunking**: `chunkMessage` (max length), `modePrefix()` (colored prefix), `tokenFooter()` (token/cost line).
- **DM relay discovery**: `getMasterDmRelays` (kind 10050) and `PROFILE_RELAYS`. `sendDm` uses these to decide where to publish.

## After editing dm-bot code

- Use judgment when deciding whether to run verification. Run `bun run lint` after substantive code changes, TypeScript changes, broad refactors, or changes likely to affect formatting/types. For small, simple edits such as docs text, comments, or a narrow CSS variable/value change, lint is optional and can be skipped.
- If the implementation changed any file under `src/` or `plugins/`, create/touch **`restart.requested`** in the project root after lint/verification passes and the change is ready for the user to test. This is the deliberate bot reload signal for `bun run watch`; do not expect restarts on every save.

## Codebase vs agent workspace

- Agent backends are invoked with `cwd` set to the **project root** (parent of dm-bot) or `dm-bot/` depending on `!workspace` setting. You may create, edit, or delete files under that root. Do not modify files outside the project root.

## Environment (runtime)

- Required: `BOT_KEY`, `BOT_MASTER_PUBKEY`, `BOT_RELAYS`.
- Optional: `BOT_PUBKEY`, `DEBUG=1`, `BOT_OPENCODE_SERVE_URL`.
- See `index.ts` top comment and `.env.example`.
