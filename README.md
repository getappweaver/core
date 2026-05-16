# AppWeaver

Open-source app hub for running AI-powered tools from a project or workspace folder you control.

## What it does

- Install AppWeaver into a project or workspace folder and add the apps you want
- Use focused tools through chat, the web UI, or AI prompts
- Choose different AI model providers through OpenCode, including pay-as-you-go via Routstr
- Run with three safety modes: ask (read-only), plan (strategy), agent (full edits)

## Key features

- **AI-powered core** — OpenCode SDK under the hood with support for any model/provider OpenCode supports
- **Prompt-driven apps** — Ask in chat, the web UI, or AI prompts, then let installed apps, skills, and commands do the work
- **Self-hostable** — Run AppWeaver on infrastructure you control without a hosted gatekeeper
- **Built-in wallet** — Pay-per-use AI with sats via Cashu and Routstr
- **Session persistence** — Resume previous conversations and switch contexts
- **Granular permissions** — Control what the agent can do
- **Local-first data** — Your data stays on the computer you control, not in a hosted cloud account
- **Open app system** — Install apps for todos, bookmarks, scheduled jobs, files, browser actions, publishing, and more, or publish your own

Built with Bun, TypeScript, nostr-tools, and the OpenCode SDK.

**Links:** [Nostr](https://nostr.com/) · [NIP-17 (encrypted DMs)](https://github.com/nostr-protocol/nips/blob/master/17.md) · [Cursor](https://cursor.com) · [OpenCode](https://opencode.ai) · [Cashu](https://cashu.space) · [Routstr](https://routstr.com)

## Apps

AppWeaver supports installable apps that add focused tools, commands, data models, and AI skills. Install one in seconds:

```bash
bun run plugin:install
```

This opens an interactive discovery flow — browse available apps, check version compatibility with your AppWeaver core, choose an alias, and the app is cloned and wired up automatically. Installed apps register commands under your chosen alias (e.g. `/todo list`, `/todo ai add a high priority task` — examples use the default **`/`** command prefix) and expose AI tools to the OpenCode backend.

To update an installed app:

```bash
bun run plugin:install todo
```

### Official apps

| App         | Official repo                               | Description                                |
| ----------- | ------------------------------------------- | ------------------------------------------ |
| **bm**      | `getappweaver/bookmarks-plugin`             | Bookmark management                        |
| **todo**    | `getappweaver/todo-plugin`                  | Todo management and AI-assisted draft flow |
| **job**     | `getappweaver/jobs-plugin`                  | Scheduled and one-off jobs                 |
| **file**    | `getappweaver/file-plugin`                  | File management                            |
| **browser** | `getappweaver/browser-plugin`               | Browser actions app in development         |
| **journal** | `getappweaver/journal-plugin`               | Private journaling and publishable notes   |

See [PLUGINS.md](PLUGINS.md) for full documentation — installing, updating, and authoring your own apps.

## How to use AppWeaver (practical guide)

You have an existing project or workspace. AppWeaver is meant to live inside it as a subfolder while operating on the parent directory by default.

1. **Put AppWeaver in your project**  
   Clone this repo into your project. `appweaver` is the recommended folder name, but any subdirectory works:

   ```bash
   git clone https://github.com/getappweaver/core.git appweaver
   ```

2. **Quick start (from the AppWeaver directory)**

```bash
cd appweaver
bun install

# Setup Nostr identity, relays, and publish kind 10050
bun run nostr:setup

# Run interactive setup (workspace, command prefix, backend, provider, mode, lint, ready)
# If you plan to use the parent workspace, this script will automatically create the necessary symlinks from AppWeaver into your project.
bun run bot:setup

# Optional: setup Cashu wallet for paid AI (Routstr)
bun run wallet:setup

# Start AppWeaver
bun run start
```

3. **Workspace**  
   The default workspace is **parent**. When you send a question or a coding task, AppWeaver works on the parent project or workspace that contains the `appweaver/` folder.

4. **Choose a backend**  
   Pick an AI agent backend that runs on your machine: OpenCode (CLI or SDK) or Cursor. See [Backends](#backends) for how to install them. Switch with `/ai backend <name>` (default DM prefix **`/`**).

5. **Choose a provider**  
   **Local** (no payment) — works with any backend and is ideal if you already have a subscription (e.g. Cursor, or [OpenCode providers](https://opencode.ai/docs/providers/) such as OpenAI, Anthropic, OpenCode Zen). If you don’t have a subscription, use **Routstr** and pay as you go with sats via Cashu. See [Choosing a provider](#choosing-a-provider). Switch with `/ai provider set local` or `/ai provider set routstr`.

6. **Chat and iterate**  
   Send messages via Nostr or the web UI. Set a mode with `/ai mode ask`, `/ai mode plan`, or `/ai mode agent`. Use **agent** mode when you want AppWeaver to apply changes, commit, and push.

**Summary:** Clone into your project → choose backend → choose provider → Nostr setup → chat → choose mode → iterate.

## Backends

AppWeaver needs an AI agent backend on your machine. Install one and ensure it’s on your PATH.

### Cursor Agent CLI

- Install and sign in via [Cursor](https://cursor.com). The `agent` CLI must be on your PATH.
- AppWeaver runs `agent create-chat` and `agent -p --resume <id> ...` for each request.
- Switch to this backend with `/ai backend cursor`. Supports both **local** (Cursor’s own auth) and **Routstr** (pay with sats) when Cursor is configured to use Routstr — see [Cursor + Routstr](#cursor--routstr).

### Cursor + Routstr

You can use the Cursor backend with the Routstr provider by pointing Cursor at Routstr in its settings:

1. In Cursor: **Cursor Settings → Models → API Keys**
2. **Open API Key:** your Routstr session key (starts with `sk-...`). Create and fund a session via AppWeaver: `/ai provider set routstr`, then `/ai provider deposit <sats>`; the key is stored locally (see [Cashu / Routstr Integration](#cashu--routstr-integration-optional)).
3. **Override OpenAI Base URL:** `https://api.routstr.com/v1`

After that, set AppWeaver’s provider to Routstr (`/ai provider set routstr`) and use `/ai backend cursor` as usual. Cursor will send requests to Routstr and you pay with sats.

### OpenCode

- Install [OpenCode](https://opencode.ai) so the `opencode` CLI is on your PATH.
- **opencode** (CLI): AppWeaver shells out to `opencode run ...`. Use `/ai backend opencode`.
- **opencode-sdk**: AppWeaver starts an in-process OpenCode server. Use `/ai backend opencode-sdk`. Requires `opencode` to be installed; the SDK runs the server for you.
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
   Use **agent** mode (`/ai mode agent`) when you want AppWeaver to apply edits, commit, and push.

For wallet commands, auto-flow, and troubleshooting, see [Cashu / Routstr Integration](#cashu--routstr-integration-optional).

## Configuration

### DM command prefix

Lines that start with your **command prefix** are treated as AppWeaver commands (built-ins and plugins). The default prefix is **`/`** (works well with many Nostr clients). You can change it — for example to **`.`** for easier mobile typing — in **`bun run bot:setup`**. The value is stored in the core SQLite DB (`state.dm_command_prefix`). All examples in this README use **`/`**; substitute your prefix if you changed it.

### Environment variables (`.env`)

The setup scripts will create `.env` automatically. You can also edit manually:

| Variable                 | Required | Description                                                                                   |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| `BOT_KEY`                | Yes      | Bot private key in hex. Generated by `nostr:setup`.                                           |
| `BOT_PUBKEY`             | No       | Bot public key (hex). Omitted = derived from `BOT_KEY`.                                       |
| `BOT_MASTER_PUBKEY`      | Yes      | Your master public key in hex format. Only messages from this pubkey are processed.           |
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

## Docker

Docker is the recommended VPS deployment path. The Docker image is a runtime environment, not the source of truth for AppWeaver code. It includes Bun, OpenCode, Cursor Agent, Chromium/Playwright dependencies, ngit, Piper, and optional VNC/noVNC support. Your AppWeaver checkout is mounted into the container at `/workspace/appweaver`, so core and plugin updates can still use git. The container runs as the non-root Playwright user `pwuser`.

Clone AppWeaver on the host if you have not already:

```bash
git clone https://github.com/getappweaver/core.git appweaver
cd appweaver
```

Build the runtime image:

```bash
docker build -t appweaver-runtime .
```

Run AppWeaver from an isolated checkout inside the container, with the web server exposed only on your machine:

```bash
docker run --rm -it \
  --name appweaver \
  -p 127.0.0.1:5551:5551 \
  -p 127.0.0.1:1455:1455 \
  appweaver-runtime
```

If `/workspace/appweaver` is empty, the container clones `${APPWEAVER_REPO_URL}` at `${APPWEAVER_GIT_REF}` before starting. The defaults are `https://github.com/getappweaver/core.git` and `main`. With `--rm`, this checkout and bot state are discarded when the container exits.

For a persistent container-managed checkout without exposing your host files, use a named Docker volume:

```bash
docker volume create appweaver-workspace
docker run -d \
  --name appweaver \
  --restart unless-stopped \
  -p 127.0.0.1:5551:5551 \
  -p 127.0.0.1:1455:1455 \
  -v appweaver-workspace:/workspace \
  appweaver-runtime
```

To run AppWeaver from a host checkout instead, bind mount it:

```bash
docker run --rm -it \
  --name appweaver \
  -p 127.0.0.1:5551:5551 \
  -p 127.0.0.1:1455:1455 \
  -v "$PWD:/workspace/appweaver" \
  appweaver-runtime
```

On startup the container runs `bun install --frozen-lockfile` inside `/workspace/appweaver`, then `bun run start`. `bun run start` builds `web/dist` and serves the UI/API on port `5551`. Port `1455` is used by OpenCode provider OAuth callbacks during setup. The bot's `parent` workspace is `/workspace`, which lets parent-scoped assets such as `opencode.json`, `AGENTS.md`, and `.opencode/agents` live outside the checkout while still being available to OpenCode. Use `ls -la /workspace` to see hidden directories such as `.opencode`.

Open the setup URL printed in the logs. It will look like:

```text
http://127.0.0.1:5551/setup?secret=...
```

The setup page exchanges that boot secret for a temporary browser session and removes the secret from the address bar.

For a long-running container, use Docker's restart policy:

```bash
docker run -d \
  --name appweaver \
  --restart unless-stopped \
  -p 127.0.0.1:5551:5551 \
  -p 127.0.0.1:1455:1455 \
  -v "$PWD:/workspace/appweaver" \
  appweaver-runtime
```

Core and plugin state stays in the mounted checkout. That includes `.env`, `dm-bot.sqlite*`, `plugins/`, `plugins.json`, browser profiles, generated web assets, and plugin-managed data. Do not mount only selected state files unless you know every path your installed plugins use.

To update AppWeaver core:

```bash
git pull
docker restart appweaver
```

To update the runtime tools, rebuild or pull the runtime image, then recreate the container with the same `/workspace/appweaver` mount:

```bash
docker build -t appweaver-runtime .
docker stop appweaver
docker rm appweaver
docker run -d \
  --name appweaver \
  --restart unless-stopped \
  -p 127.0.0.1:5551:5551 \
  -p 127.0.0.1:1455:1455 \
  -v "$PWD:/workspace/appweaver" \
  appweaver-runtime
```

Plugin updates should use AppWeaver's plugin update/install flow. Those changes happen in the mounted checkout and persist across container restarts.

### Secure setup access

The setup URL can configure secrets such as bot keys, relay settings, and provider credentials. Treat it as a local-only admin interface.

- Do not expose setup over public plain HTTP.
- Bind Docker ports on the host to `127.0.0.1`, not all interfaces. Use `-p 127.0.0.1:5551:5551` and `-p 127.0.0.1:1455:1455`, not `-p 5551:5551` or `-p 1455:1455`. The app still listens on `0.0.0.0` inside the container so Docker can forward the localhost-only host port.
- If AppWeaver is running on a VPS, keep port `5551` closed to the internet and use SSH port forwarding.
- If you intentionally expose setup remotely, put HTTPS in front of it with a trusted tunnel or reverse proxy such as Caddy, Traefik, Tailscale HTTPS, or Cloudflare Tunnel.

For VPS setup, start the container on the VPS with localhost-only port publishing, then from your laptop run:

```bash
ssh -L 5551:127.0.0.1:5551 -L 1455:127.0.0.1:1455 user@VPS_PUBLIC_IP
```

Then open this on your laptop:

```text
http://127.0.0.1:5551/setup?secret=...
```

After the page loads, the secret is removed from the browser URL and setup API calls use the temporary local session.

Although the browser URL uses `http://`, the traffic between your laptop and the VPS is encrypted inside SSH. The plain HTTP connection exists only on loopback interfaces (`127.0.0.1`) at each end of the tunnel.

Optional browser/VNC ports should also be localhost-only if enabled:

```bash
-p 127.0.0.1:5900:5900 -p 127.0.0.1:6080:6080 -e ENABLE_VNC=1
```

### Watch mode (development)

- **`bun run watch`** – Runs AppWeaver under a small watcher that restarts **only** when the file **`restart.requested`** is created or touched. Use this when the agent may edit the core code: the agent (with your approval) runs `touch restart.requested` when it’s done changing code; the watcher restarts the app. AppWeaver deletes `restart.requested` on startup. No restart on every save.

### Local terminal chat (CLI input)

You can chat with AppWeaver directly from the same terminal process, without sending messages from your phone app.

- Type or paste a message after the `>` prompt and press Enter to send.
- Replies are printed back in terminal.
- Command lines work locally too (`/help`, `/ai mode ask`, `/session new`, etc.).
- Nostr DM handling continues in parallel, so you can use phone and terminal at the same time.

Local terminal chat is enabled when stdin is a TTY.

The agent is scoped to the **project root** (one level up from the AppWeaver directory). For example, if AppWeaver lives at `~/Projects/XYZ/appweaver`, the agent may only edit files under `~/Projects/XYZ/`.

On startup AppWeaver sends one DM to the master: `Agent is ready.` Then it listens for your messages. Plain messages (no command prefix) are sent to the agent in the current session; replies are prefixed with `<ask>`, `<plan>`, `<agent>` or similar according to the current mode.

**Prerequisite:** Install a [backend](#backends) (Cursor Agent CLI or OpenCode) and ensure it’s on your PATH.

## Commands

AppWeaver responds only to the master pubkey. Use your configured **DM command prefix** (default **`/`** — see [DM command prefix](#dm-command-prefix)).

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

- `BOT_BROWSER_PROFILE_DIR` — persistent profile directory for Playwright Chromium. Default: `appweaver/.data/browser-profile`
- `BOT_BROWSER_HEADLESS` — set to `1` to run headless. Default: `0`

One-time local setup for Chromium:

```bash
bunx playwright install chromium
```

## Cashu / Routstr Integration (Optional)

AppWeaver supports paid AI providers via Cashu tokens and [Routstr](https://routstr.com). This is optional — by default it uses your existing provider credentials from the environment.

### How It Works

**Two payment flows:**

1. **Auto-flow** (recommended): Append `!!<sats>` to any prompt
   - Example: `fix the auth bug !!2000sats`
   - AppWeaver automatically deposits sats to Routstr, runs the agent, then refunds unspent sats back to your local wallet

2. **Manual flow**: Pre-fund a Routstr session, then use normally
   - `/ai provider deposit <sats>` to fund the session
   - `/ai provider refund` to recover unspent balance when done

### Cashu and the built-in wallet

AppWeaver’s built-in wallet holds Cashu eCash tokens (sats) that you can spend on Routstr. **It does not support minting via Lightning** — you cannot create a Lightning invoice inside AppWeaver and pay it to receive sats directly.

To add funds, use an external Cashu-capable wallet (e.g. [cashu.me](https://cashu.me)). There you can receive sats (e.g. by creating a Lightning invoice and paying it from any Lightning wallet). After payment you receive a **Cashu token**. Paste that token into AppWeaver with:

```bash
/wallet receive <token>
```

AppWeaver will redeem the token and the sats will appear in your local wallet balance. You can then use them for Routstr (`/ai provider deposit` or auto-flow with `!!sats`).

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

AppWeaver will:

1. Check/create a Routstr session
2. Deposit the sats from your local wallet
3. Run the agent with those funds
4. Automatically refund unspent sats back to your local wallet

### External wallet options

Ways to get Cashu tokens that you can paste into AppWeaver with `/wallet receive <token>`:

1. **[cashu.me](https://cashu.me)** — Receive tab → Create invoice → Pay from a Lightning wallet → Copy the token and paste into AppWeaver
2. **Minibits** — App → Wallet → Receive → Copy Lightning invoice → Pay from any Lightning wallet → receive token, then `/wallet receive <token>` in AppWeaver

### Troubleshooting

- **"No mint configured"**: Run `/wallet mint <url>` first
- **"Wallet not available"**: Make sure to run `bun run wallet:setup` to create a Cashu wallet and set the mnemonic in `.env`
- **"Insufficient balance"**: Top up with `/wallet receive <token>` from external wallet
- **"No Routstr session"**: Run `/ai provider deposit <sats>` or append `!!sats` to your prompt

### Post-agent lint behavior

When execution mode is `agent`, AppWeaver runs `bun run lint` after each agent response for the active workspace target:

- `parent` = project root (default),
- `bot` = AppWeaver core directory.

- If lint passes, the lint summary is appended to the response.
- If lint fails, AppWeaver runs one additional agent round with lint output as feedback, then sends the combined result.
- If lint cannot run in runtime (for example, missing bun), AppWeaver logs the issue and sends the original agent response.

## Sending a DM to AppWeaver

Use a NIP-17–compatible client (e.g. Damus, Coracle, 0xChat, or any app that supports NIP-17 DMs). Send an encrypted DM to the **bot pubkey** (hex or npub). AppWeaver only reacts to messages from `BOT_MASTER_PUBKEY`.

- If your app looks up kind 10050 (indicates the user's preferred relays to receive DMs) for the bot pubkey, it will send to the relay(s) advertised there.
- The `nostr:setup` script automatically publishes kind 10050 to your relays.

## Troubleshooting

- **AppWeaver sends “Agent is ready” but you don’t receive it**  
  Your app may be reading DMs from relays listed in **your** kind 10050. AppWeaver already discovers your 10050 and publishes there; ensure your app is connected to those relays.

- **You send a reply but AppWeaver never answers**
  1. AppWeaver must advertise where to receive DMs — `nostr:setup` publishes kind 10050 automatically.
  2. `BOT_RELAYS` in `.env` must match the relay(s) in that 10050 (same URLs, including trailing slash if the relay uses it).
  3. Some relays (e.g. auth.nostr1.com) require NIP-42 AUTH; AppWeaver signs AUTH when the relay challenges it. If your **phone app** fails to send, it may need to complete AUTH on that relay too.

- **More visibility**  
  Run with `DEBUG=1` to see subscription filter, incoming events, where AppWeaver publishes, and AUTH challenges.

## For developers / AI agents

When changing AppWeaver core code:

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
- **State**: SQLite at `dm-bot.sqlite` (tables: `seen_events`, `sessions`, `session_messages`, `state`). See `index.ts` for schema. The filename is currently kept for compatibility.
- **New commands**: Register a built-in root in `src/commands/prefixed-handlers.ts` and definitions, or add a plugin.
- **After edits**: Touch `restart.requested` in the AppWeaver directory so the watcher restarts the app (when using `bun run watch`). Run the linter with auto-fix: from project root `bun run lint`, or from `appweaver` run `bun run lint`.

### Configure safe bun scripts for agent shell access

If your project rule requires approval for shell commands, you can still allow common project tasks by whitelisting bun scripts.
This is a practical pattern because the agent can only run commands already defined in `package.json` `scripts` (for example `build`, `lint`, `test`).

Add or update the **CLI permission and workspace boundary** section in `AGENTS.md` (root of this repo) like this:

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

Full codebase context and extension points are in **AGENTS.md** (section **AppWeaver Codebase Context**).
