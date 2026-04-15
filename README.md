Main repo: https://gitworkshop.dev/_@dhalsim.github.io/nostr-dm-agent

# Nostr DM Bot

Control AI agents remotely via Nostr DMs. A bridge between encrypted messaging and local AI coding assistants.

## What it does

- DM your bot from any Nostr client → it spawns Cursor or OpenCode to work on your codebase
- Work on projects from your phone, anywhere in the world
- Pay for AI compute with Bitcoin over Cashu using Routstr
- Three safety modes: ask (read-only), plan (strategy), agent (full edits)

## Key features

- **NIP-17 encrypted DMs** — Private messages over any Nostr relay
- **Remote agent control** — Cursor Agent or OpenCode integration
- **Session persistence** — Resume previous conversations, switch contexts
- **Bitcoin payments** — Pay-per-use AI with sats via Cashu using Routstr
- **Dual interface** — Nostr DMs + local terminal chat
- **Granular permissions** — Control what the agent can do
- **Plugin system** — Extend the bot with community plugins for todos, jobs, and more

Built with Bun, nostr-tools, and TypeScript.

**Links:** [Nostr](https://nostr.com/) · [NIP-17 (encrypted DMs)](https://github.com/nostr-protocol/nips/blob/master/17.md) · [Cursor](https://cursor.com) · [OpenCode](https://opencode.ai) · [Cashu](https://cashu.space) · [Routstr](https://routstr.com)

## Plugins

The bot supports community plugins that add new commands and AI tools. Install one in seconds:

```bash
bun run plugin:install
```

This opens an interactive discovery flow — browse available plugins, check version compatibility with your bot, choose an alias, and the plugin is cloned and wired up automatically. Installed plugins register commands under your chosen alias (e.g. `/todo list`, `/todo ai add a high priority task` — examples use the default **`/`** DM command prefix) and expose AI tools to the OpenCode backend.

To update an installed plugin:

```bash
bun run plugin:install todo
```

### Some Plugins

| Plugin                 | Nostr URI                                        | Description                                                                                                                             |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **dm-bot-bm-plugin**   | `nostr://_@dhalsim.github.io/dm-bot-bm-plugin`   | Bookmark management: add, list, mark as to_read, manage with AI                                                                         |
| **dm-bot-todo-plugin** | `nostr://_@dhalsim.github.io/dm-bot-todo-plugin` | Todo management: add, list, and complete tasks; create drafts from natural language with `/todo ai`; accept, revise, or decline drafts. |
| **dm-bot-job-plugin**  | `nostr://_@dhalsim.github.io/dm-bot-job-plugin`  | Scheduled and one-off jobs: cron and run-once tasks; create job drafts with `/job ai`; enable, disable, run, and view history.          |
| **dm-bot-file-plugin** | `nostr://_@dhalsim.github.io/dm-bot-file-plugin` | File management: upload, download, and list files                                                                                       |

See [PLUGINS.md](PLUGINS.md) for full documentation — installing, updating, and authoring your own plugins.

## How to use the bot (practical workflow)

You have an existing project — we call it the **parent** in workspace terms.

1. **Put the bot in your project**  
   Fork and clone this repo into your project, naming the directory `dm-bot`:

   ```bash
   git clone https://github.com/YOUR_USERNAME/nostr-dm-bot.git dm-bot
   ```

2. **Quick start (from the bot directory)**

```bash
cd dm-bot
bun install

# Setup Nostr identity, relays, and publish kind 10050
bun run nostr:setup

# Run interactive bot setup (workspace, DM command prefix, backend, provider, mode, lint, ready)
# If you plan to use the parent workspace, this script will automatically create the necessary symlinks from the bot into your project.
bun run bot:setup

# Optional: setup Cashu wallet for paid AI (Routstr)
bun run wallet:setup

# Start the bot
bun run start
```

3. **Workspace**  
   The default workspace is **parent**. When you send a question or a coding task, the agent works on your parent project (the repo that contains the bot).

4. **Choose a backend**  
   Pick an AI agent backend that runs on your machine: OpenCode (CLI or SDK) or Cursor. See [Backends](#backends) for how to install them. Switch with `/ai backend <name>` (default DM prefix **`/`**).

5. **Choose a provider**  
   **Local** (no payment) — works with any backend and is ideal if you already have a subscription (e.g. Cursor, or [OpenCode providers](https://opencode.ai/docs/providers/) such as OpenAI, Anthropic, OpenCode Zen). If you don’t have a subscription, use **Routstr** and pay as you go with sats via Cashu. See [Choosing a provider](#choosing-a-provider). Switch with `/ai provider set local` or `/ai provider set routstr`.

6. **Chat and iterate**  
   Send messages via Nostr DM or the local terminal. Set a mode with `/ai mode ask`, `/ai mode plan`, or `/ai mode agent`. Use **agent** mode when you want the bot to apply changes, commit, and push.

**Summary:** Clone into your project (add to `.gitignore`) → choose backend → choose provider → Nostr setup → chat → choose mode → iterate.

## Backends

The bot needs an AI agent backend on your machine. Install one and ensure it’s on your PATH.

### Cursor Agent CLI

- Install and sign in via [Cursor](https://cursor.com). The `agent` CLI must be on your PATH.
- The bot runs `agent create-chat` and `agent -p --resume <id> ...` for each request.
- Switch to this backend with `/ai backend cursor`. Supports both **local** (Cursor’s own auth) and **Routstr** (pay with sats) when Cursor is configured to use Routstr — see [Cursor + Routstr](#cursor--routstr).

### Cursor + Routstr

You can use the Cursor backend with the Routstr provider by pointing Cursor at Routstr in its settings:

1. In Cursor: **Cursor Settings → Models → API Keys**
2. **Open API Key:** your Routstr session key (starts with `sk-...`). Create and fund a session via the bot: `/ai provider set routstr`, then `/ai provider deposit <sats>`; the key is stored in the bot (see [Cashu / Routstr Integration](#cashu--routstr-integration-optional)).
3. **Override OpenAI Base URL:** `https://api.routstr.com/v1`

After that, set the bot’s provider to Routstr (`/ai provider set routstr`) and use `/ai backend cursor` as usual. Cursor will send requests to Routstr and you pay with sats.

### OpenCode

- Install [OpenCode](https://opencode.ai) so the `opencode` CLI is on your PATH.
- **opencode** (CLI): the bot shells out to `opencode run ...`. Use `/ai backend opencode`.
- **opencode-sdk**: the bot starts an in-process OpenCode server. Use `/ai backend opencode-sdk`. Requires `opencode` to be installed; the SDK runs the server for you.
- OpenCode supports both **local** (your API keys / opencode.json) and **Routstr** (pay with sats).

## Choosing a provider

- **Local** — No payment layer. The backend uses your own config: Cursor’s auth, or for OpenCode your [providers](https://opencode.ai/docs/providers/) (e.g. OpenAI, Anthropic, OpenCode Zen) and API keys in `opencode.json`. Ideal if you already have a subscription.
- **Routstr** — Pay per request with Bitcoin (sats) via Cashu. Use this if you don’t have a subscription. Requires a Cashu wallet and a mint that Routstr works with.

### Using Routstr

1. **Setup a Cashu wallet**  
   Run `bun run wallet:setup` and store the mnemonic in `.env` as `CASHU_MNEMONIC`.

2. **Add a mint**  
   Use a mint that Routstr accepts. Official options:
   - https://mint.minibits.cash/Bitcoin
   - https://mint.cubabitcoin.org
   - https://ecashmint.otrta.me
   - https://mint.coinos.io

   Add one with: `/wallet mint <mintURL>`.

3. **Receive sats into your local wallet**  
   Use `/wallet receive <token>`. You can get a token from another Cashu wallet (e.g. [cashu.me](https://cashu.me)): create an invoice, pay with Lightning, then paste the received token into `/wallet receive <token>`.

4. **Switch to Routstr and deposit**  
   `/ai provider set routstr`, then `/ai provider deposit <sats>` (or use auto-flow by appending `!!<sats>` to a prompt — the `!!` budget suffix is separate from your DM command prefix).

5. **Set a Routstr model**  
   `/ai models` then `/ai model routstr/<model-id>`.

6. **Apply changes**  
   Use **agent** mode (`/ai mode agent`) when you want the bot to apply edits, commit, and push.

For wallet commands, auto-flow, and troubleshooting, see [Cashu / Routstr Integration](#cashu--routstr-integration-optional).

## Configuration

### DM command prefix

Lines that start with your **command prefix** are treated as bot commands (built-ins and plugins). The default prefix is **`/`** (works well with many Nostr clients). You can change it — for example to **`.`** for easier mobile typing — in **`bun run bot:setup`**. The value is stored in the core SQLite DB (`state.dm_command_prefix`). All examples in this README use **`/`**; substitute your prefix if you changed it.

### Environment variables (`.env`)

The setup scripts will create `.env` automatically. You can also edit manually:

| Variable                 | Required | Description                                                                                   |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| `BOT_KEY`                | Yes      | Bot's private key in hex. Generated by `nostr:setup`.                                         |
| `BOT_PUBKEY`             | No       | Bot's public key (hex). Omitted = derived from `BOT_KEY`.                                     |
| `BOT_MASTER_PUBKEY`      | Yes      | Your (master) public key in hex format. Only messages from this pubkey are processed.         |
| `BOT_RELAYS`             | Yes      | Comma-separated relay URLs. Set by `nostr:setup`.                                             |
| `DEBUG`                  | No       | Set to `1` for extra logging.                                                                 |
| `LOG`                    | No       | Set to `0` to suppress log() output. Default `1`.                                             |
| `BOT_OPENCODE_SERVE_URL` | No       | Attach to a running opencode server.                                                          |
| `CASHU_DEFAULT_MINT_URL` | No       | Default mint that is going to be used by the local cashu wallet. Generated by `wallet:setup`. |
| `CASHU_MNEMONIC`         | No       | 12-word Cashu wallet mnemonic. Generated by `wallet:setup`.                                   |

Example `.env`:

```bash
BOT_KEY=abc123...your_64_hex_private_key
BOT_MASTER_PUBKEY=6e64b83c1f674fb00a5f19816c297b6414bf67f015894e04dd4c657e94102ee8
BOT_RELAYS=wss://auth.nostr1.com/,wss://relay.netstr.io
# DEBUG=1

# Optional: Cashu/Routstr for paid AI
# CASHU_MNEMONIC="word1 word2 ... word12"
# ROUTSTR_BASE_URL=https://api.routstr.com/v1
```

## Run

```bash
bun run start
```

### Watch mode (development)

- **`bun run watch`** – Runs the bot under a small watcher that restarts **only** when the file **`restart.requested`** is created or touched. Use this when the agent may edit the bot’s code: the agent (with your approval) runs `touch restart.requested` when it’s done changing code; the watcher restarts the app. The bot deletes `restart.requested` on startup. No restart on every save.

### Local terminal chat (CLI input)

You can chat with the bot directly from the same terminal process, without sending messages from your phone app.

- Type or paste a message after the `>` prompt and press Enter to send.
- Replies are printed back in terminal.
- Command lines work locally too (`/help`, `/ai mode ask`, `/session new`, etc.).
- Nostr DM handling continues in parallel, so you can use phone and terminal at the same time.

Local terminal chat is enabled when stdin is a TTY.

The agent is scoped to the **project root** (one level up from the dm-bot directory). For example, if dm-bot lives at `~/Projects/XYZ/dm-bot`, the agent may only edit files under `~/Projects/XYZ/`.

On startup the bot sends one DM to the master: `Agent is ready.` Then it listens for your messages. Plain messages (no command prefix) are sent to the agent in the current session; replies are prefixed with `<ask>`, `<plan>`, `<agent>` or similar according to the current mode.

**Prerequisite:** Install a [backend](#backends) (Cursor Agent CLI or OpenCode) and ensure it’s on your PATH.

## Commands

The bot responds only to the master pubkey. Use your configured **DM command prefix** (default **`/`** — see [DM command prefix](#dm-command-prefix)).

**Discover commands:** send **`/help`** for a list of roots, or **`/help <command>`** for detailed usage (e.g. **`/help session`**, **`/help bot`**).

**Built-in roots:** `help`, `session`, `bot`, `ai`, `wallet`, `bunker`, `wot` — e.g. `/session new`, `/session list`, `/bot status`, `/bot browser open https://example.com and summarize it`, `/bot workspace parent`, `/ai mode ask`, `/ai backend opencode-sdk`.

| Kind                      | Description                                                   |
| ------------------------- | ------------------------------------------------------------- | ---- | ---------------------------- |
| Plain message (no prefix) | Sent to the agent in the current session. Reply format: `<ask | plan | agent> …` according to mode. |
| Prefixed line             | Routed to built-ins or a plugin (e.g. `/todo …`).             |

Plugin aliases and subcommands are documented under **`/help`** and each plugin’s help.

## Browser Demo

`/bot browser <prompt>` runs a backend-managed Playwright browser session and lets the current AI backend drive it through a compact structured snapshot loop.

- The browser runs from the backend, not from a separate app.
- It uses a persistent Chromium profile directory, so login state can be reused across runs.
- It is headed by default (`BOT_BROWSER_HEADLESS=0`), which is useful for logging into sites like X manually and reusing that session later.
- If the AI determines that login or 2FA is required, it can pause and prompt you to finish that step manually in the opened browser, then continue after your reply.
- When the task finishes, the browser closes, but the profile directory remains for reuse on the next run.

Example:

```bash
/bot browser open https://example.com, take a snapshot, click the main link, and tell me where you ended up
```

Optional environment variables:

- `BOT_BROWSER_PROFILE_DIR` — persistent profile directory for Playwright Chromium. Default: `dm-bot/.data/browser-profile`
- `BOT_BROWSER_HEADLESS` — set to `1` to run headless. Default: `0`

One-time local setup for Chromium:

```bash
bunx playwright install chromium
```

## Cashu / Routstr Integration (Optional)

The bot supports paid AI providers via Cashu tokens and [Routstr](https://routstr.com). This is optional — by default the bot uses your existing `OPENAI_API_KEY` from the environment.

### How It Works

**Two payment flows:**

1. **Auto-flow** (recommended): Append `!!<sats>` to any prompt
   - Example: `fix the auth bug !!2000sats`
   - Bot automatically deposits sats to Routstr, runs the agent, then refunds unspent sats back to your local wallet

2. **Manual flow**: Pre-fund a Routstr session, then use normally
   - `/ai provider deposit <sats>` to fund the session
   - `/ai provider refund` to recover unspent balance when done

### Cashu and the bot wallet

The bot’s wallet holds Cashu eCash tokens (sats) that you can spend on Routstr. **The bot does not support minting via Lightning** — you cannot create a Lightning invoice inside the bot and pay it to receive sats directly.

To add funds, use an external Cashu-capable wallet (e.g. [cashu.me](https://cashu.me)). There you can receive sats (e.g. by creating a Lightning invoice and paying it from any Lightning wallet). After payment you receive a **Cashu token**. Paste that token into the bot with:

```bash
/wallet receive <token>
```

The bot will redeem the token and the sats will appear in your local wallet balance. You can then use them for Routstr (`/ai provider deposit` or auto-flow with `!!sats`).

### Wallet Commands

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `/wallet mint [url]`      | Show/set your Cashu mint URL            |
| `/wallet balance`         | Show local wallet balance               |
| `/wallet receive <token>` | Receive a Cashu token into local wallet |
| `/wallet history`         | Show recent spend history               |

### Provider Commands

(subcommand of `ai`; examples use default prefix `/`)

| Command                           | Description                                          |
| --------------------------------- | ---------------------------------------------------- |
| `/ai provider set local\|routstr` | Switch payment provider                              |
| `/ai provider deposit <sats>`     | Move sats from local wallet to Routstr session       |
| `/ai provider refund`             | Recover unspent Routstr balance to local wallet      |
| `/ai provider balance`            | Check remaining Routstr session balance              |
| `/ai provider budget <sats>`      | Set default budget (used when no `!!sats` in prompt) |
| `/ai provider status`             | Show provider, session, mint, model, budget          |
| `/ai provider sync-models`        | Refresh Routstr model cache                          |

### Model Selection

```bash
# List Routstr models (cached)
/ai models

# Set a specific model for Routstr
/ai model routstr/gpt-4o-mini

# Clear model override
/ai model reset
```

### Using Auto-Flow

Simply append `!!<sats>` to any prompt:

```
fix the login bug !!1000sats
```

The bot will:

1. Check/create a Routstr session
2. Deposit the sats from your local wallet
3. Run the agent with those funds
4. Automatically refund unspent sats back to your local wallet

### External wallet options

Ways to get Cashu tokens that you can paste into the bot with `/wallet receive <token>`:

1. **[cashu.me](https://cashu.me)** — Receive tab → Create invoice → Pay from a Lightning wallet → Copy the token and paste into the bot
2. **Minibits** — App → Wallet → Receive → Copy Lightning invoice → Pay from any Lightning wallet → receive token, then `/wallet receive <token>` in the bot

### Troubleshooting

- **"No mint configured"**: Run `/wallet mint <url>` first
- **"Wallet not available"**: Make sure to run `bun run wallet:setup` to create a Cashu wallet and set the mnemonic in `.env`
- **"Insufficient balance"**: Top up with `/wallet receive <token>` from external wallet
- **"No Routstr session"**: Run `/ai provider deposit <sats>` or append `!!sats` to your prompt

### Post-agent lint behavior

When execution mode is `agent`, the bot runs `bun run lint` after each agent response for the active workspace target:

- `parent` = project root (default),
- `bot` = `dm-bot` directory.

- If lint passes, the lint summary is appended to the response.
- If lint fails, the bot runs one additional agent round with lint output as feedback, then sends the combined result.
- If lint cannot run in runtime (for example, missing bun), bot logs the issue and sends the original agent response.

## Sending a DM to the bot

Use a NIP-17–compatible client (e.g. Damus, Coracle, 0xChat, or any app that supports NIP-17 DMs). Send an encrypted DM to the **bot’s pubkey** (hex or npub). The bot only reacts to messages from `BOT_MASTER_PUBKEY`.

- If your app looks up kind 10050 (indicates the user's preferred relays to receive DMs) for the bot, it will send to the relay(s) advertised there.
- The `nostr:setup` script automatically publishes kind 10050 to your relays.

## Troubleshooting

- **Bot sends “Agent is ready” but you don’t receive it**  
  Your app may be reading DMs from relays listed in **your** kind 10050. The bot already discovers your 10050 and publishes there; ensure your app is connected to those relays.

- **You send a reply but the bot never answers**
  1. The bot must advertise where to receive DMs — `nostr:setup` publishes kind 10050 automatically.
  2. `BOT_RELAYS` in `.env` must match the relay(s) in that 10050 (same URLs, including trailing slash if the relay uses it).
  3. Some relays (e.g. auth.nostr1.com) require NIP-42 AUTH; the bot signs AUTH when the relay challenges it. If your **phone app** fails to send, it may need to complete AUTH on that relay too.

- **More visibility**  
  Run with `DEBUG=1` to see subscription filter, incoming events, where the bot publishes, and AUTH challenges.

## For developers / AI agents

When changing dm-bot code:

- **Contributing:** Run `bun run contrib:setup` once to enable the version-bump commit hooks (see [CONTRIBUTING.md](CONTRIBUTING.md)).
- **File map**: Main entry is `src/index.ts`. Key modules:
  - `src/logger.ts` — debug(), log(), logError(), ANSI colors
  - `src/env.ts` — loadBotConfig(), env parsing
  - `src/db.ts` — SQLite schema, state getters/setters, Zod schemas
  - `src/session.ts` — Session CRUD
  - `src/backends/types.ts` — AgentBackend interface
  - `src/backends/cursor.ts` — Cursor backend factory
  - `src/backends/opencode.ts` — OpenCode backend + JSONL parser
  - `src/backends/factory.ts` — createBackend() dispatcher
  - `src/messaging.ts` — sendDm(), chunkMessage(), NIP-17 relay discovery
  - `src/commands/` — `handleBuiltinCommand` / `routePrefixedCommand`, built-in + plugin dispatch
  - `src/lint.ts` — runPostAgentLint(), formatLintSummary()
  - `scripts/run-with-restart.ts` watches for restart.requested
- **State**: SQLite at `dm-bot.sqlite` (tables: `seen_events`, `sessions`, `session_messages`, `state`). See `index.ts` for schema.
- **New commands**: Register a built-in root in `src/commands/prefixed-handlers.ts` and definitions, or add a plugin.
- **After edits**: Touch `restart.requested` in the dm-bot directory so the watcher restarts the bot (when using `bun run watch`). Run the linter with auto-fix: from project root `bun run lint`, or from dm-bot `bun run lint`.

### Configure safe bun scripts for agent shell access

If your project rule requires approval for shell commands, you can still allow common project tasks by whitelisting bun scripts.
This is a practical pattern because the agent can only run commands already defined in `package.json` `scripts` (for example `build`, `lint`, `test`).

Add or update `dm-bot/.cursor/rules/agent-cli-permission.mdc` like this:

```md
## Whitelist (no permission required)

You may run these without asking. Everything else requires permission.

### Package scripts (trusted by project config)

- `bun run <script>` when `<script>` exists in the nearest `package.json` `scripts` field.
- `bun test` when backed by package scripts or default bun test behavior.
- `bun run` (list scripts only, read-only).

Before running a package script, the agent should:

1. Read `package.json`.
2. Verify the script name exists.
3. Run only that script command (no extra shell chaining like `&&`, `;`, or pipes unless user explicitly approves).

### Common read-only commands

- `bun --version`
- `ls`, `pwd`, `cat` for reading files
- `git status`, `git diff`, `git log`
```

With this setup, commands such as `bun run build` and `bun run lint` are available to the agent without extra per-command approvals, while still keeping execution bounded to your script definitions.

Full codebase context and extension points are in **.cursor/rules/dm-bot-context.mdc** in this directory.
