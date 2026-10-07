# [AppWeaver](https://getappweaver.com)

Open-source app hub for running AI-powered tools from a project or workspace folder you control.

## What It Does

- Install AppWeaver into a project or workspace folder and add the apps you want.
- Use focused tools through the web interface, web chat, local terminal input, or your favourite Nostr chat app.
- Run AI tasks with OpenCode and choose models from the active model source for your workspace.
- Keep data local: configuration, sessions, app data, wallet data, and browser profiles live on your machine or server.

## Key Features

- **Easy UI setup** — Clone the repo, run `bun install` and `bun run start`, then follow the web setup interface.
- **AI-powered apps** — Install apps for todos, bookmarks, jobs, files, browser actions, publishing, journaling, and more.
- **Multiple control surfaces** — Use the web UI, Nostr DMs, terminal chat, or AI-agent tool calls.
- **OpenCode AI runtime** — Configure OpenCode providers locally; switch between the core model source and installed model-source apps for workspace-specific catalogs.
- **Bitcoin-native wallet** — Keep Cashu eCash locally; apps can offer payment flows where supported.
- **Local-first data** — AppWeaver stores state in folders you control.

Built with Bun, TypeScript, nostr-tools, OpenCode, Solid, and SQLite.

For contributors, [local documentation](docs/LOCAL_DOCUMENTATION_MIGRATION.md)
lives beside its owning plugin/module. READMEs and docs evolve with code;
`AGENTS.md` contains stable, explicitly maintained working instructions. Memory
indexes committed source and documentation for discovery.

**Links:** [Nostr](https://nostr.com/) · [NIP-17 encrypted DMs](https://github.com/nostr-protocol/nips/blob/master/17.md) · [OpenCode](https://opencode.ai) · [Cashu](https://cashu.space) · [ngit](https://gitworkshop.dev/ngit)

## Install And Setup

AppWeaver is meant to live inside the project or workspace you want it to operate on. The recommended folder name is `appweaver`.

You can install AppWeaver natively, or use [Docker](DOCKER.md) if you want the runtime dependencies packaged for you.

```bash
git clone --depth=1 https://github.com/getappweaver/core.git appweaver
cd appweaver
bun install
bun run start
```

On first start, AppWeaver prints a setup URL in the terminal:

```text
Setup web: http://127.0.0.1:5551/setup?secret=...
```

Ctrl+Click the link if your terminal supports it, or copy and paste it into your browser. The setup page exchanges the boot secret for a temporary browser session and removes the secret from the address bar.

Follow the instructions in the setup interface, then click the restart button when setup says it is ready.

After restart, AppWeaver listens for Nostr DMs, serves the web UI, and accepts local terminal chat from the same terminal process.

The default workspace is **parent**. For example, if AppWeaver is installed at `~/Projects/my-project/appweaver`, the default AI workspace is `~/Projects/my-project`.

## Dependencies

Setup checks the tools AppWeaver expects to find on the server `PATH`.

Required:

| Tool     | Why it matters                                |
| -------- | --------------------------------------------- |
| Bun      | Runtime, scripts, package install, web build  |
| Node.js  | Required by parts of the AI/backend toolchain |
| OpenCode | AI runtime and model/provider support         |
| Git      | Core and app updates                          |
| ngit     | Nostr Git remotes, app installs, app updates  |

Optional:

| Tool               | Why it matters                        |
| ------------------ | ------------------------------------- |
| Python (`python3`) | Useful if installing Piper via `pip`  |
| Piper              | Local text-to-speech support          |


Common install links:

- Bun: [https://bun.sh/docs/installation](https://bun.sh/docs/installation)
- Node.js: [https://nodejs.org/](https://nodejs.org/)
- Git: [https://git-scm.com/downloads](https://git-scm.com/downloads)
- ngit: [https://gitworkshop.dev/ngit](https://gitworkshop.dev/ngit)
- OpenCode: [https://opencode.ai/](https://opencode.ai/)
- Python: [https://www.python.org/downloads/](https://www.python.org/downloads/)
- Piper: [https://github.com/OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)

## Piper TTS

Piper is optional. When configured, AppWeaver can use local speech output without a hosted TTS service.

The setup page can:

- Detect `piper` on your `PATH`.
- Save the detected binary path.
- Download a default voice model to `models/piper/` inside the AppWeaver folder.
- Save the Piper model and library paths into `.env`.

If you install Piper with Python, a common command is:

```bash
pip install piper-tts
```

## Apps

AppWeaver apps add focused tools, commands, data models, widgets, and AI skills.

Install and update apps from the web UI. The app installer shows available apps, compatibility, author metadata, install progress, and restart status.

[Interactive Todo app demo](https://getappweaver.com/apps/todo)

![Todo app screenshot](https://getappweaver.com/screenshots/todo.png)

### Official Apps

| App | Description |
| --- | ----------- |
| **Todo app** | Create, organize, and draft task updates with AI help. |
| **File manager** | Browse workspace trees, inspect files, and manage project content. |
| **Job scheduler** | Schedule one-off and recurring jobs for AppWeaver to run later. |
| **Bookmark manager** | Save, search, categorize, and publish bookmark collections. |
| **Browser actions** | Drive browser sessions for web automation and research tasks. |
| **Captain's Log** | Adds private journaling, searchable notes, drafts, and optional publishing to Nostr. |

## AI Models And Cashu

OpenCode is the AI runtime. Configure providers in your workspace's managed OpenCode configuration, or install a model-source app to supply its own catalog and runtime configuration. Use `/ai source` to see available sources and `/ai source core` to return to the core OpenCode catalog. For example, the optional PPQ app provides its own model source and funding flow.

AppWeaver's built-in wallet stores Cashu eCash tokens. It does not mint via Lightning directly; use an external Cashu wallet such as [cashu.me](https://cashu.me) or Minibits to receive sats, then paste the Cashu token into AppWeaver.

To use the local Cashu wallet:

1. Configure or generate a Cashu wallet in setup.
2. Set a mint with `/cashu mint <mintURL>` if needed.
3. Receive tokens with `/cashu receive <token>`.

Useful commands:

| Command                  | Description                        |
| ------------------------ | ---------------------------------- |
| `/cashu mint [url]`      | Show or set your Cashu mint URL    |
| `/cashu balance`         | Show local Cashu wallet balance    |
| `/cashu receive <token>` | Receive a Cashu token              |
| `/cashu history`         | Show recent Cashu spend history    |
| `/wallet list`           | Show the aggregate wallet overview |
| `/ai source`             | List installed model sources       |
| `/ai models`             | List models from the active source |


## Docker

Docker is the recommended VPS deployment path. See [DOCKER.md](DOCKER.md) for the container setup, persistent volume layout, update flow, and secure setup access notes.

## Development

Use watch mode while changing AppWeaver itself:

```bash
bun run watch
```

`bun run watch` runs AppWeaver under a small watcher that restarts only when `restart.requested` is created or touched. It does not restart on every save. AppWeaver deletes `restart.requested` on startup.

For contribution hooks:

```bash
bun run contrib:setup
```

When changing AppWeaver core code, run targeted checks where possible or `bun run lint` for broad changes. See [.appweaver/AGENTS.md](.appweaver/AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) for contributor and AI-agent workflow details.

If you want AppWeaver to work on its own core code, set the workspace to `appweaver` in setup or the web UI.

For app/plugin development, see [PLUGINS.md](PLUGINS.md).

## Troubleshooting

- **No setup page opens**: Copy the full setup URL from the terminal or Docker logs into your browser. Confirm port `5551` is reachable locally.
- **A dependency is missing**: Install it, restart AppWeaver, then reload setup. Setup checks the server process `PATH`.
- **Nostr DMs do not arrive**: Confirm `BOT_RELAYS` matches the relay URLs your Nostr client uses for encrypted DMs. Some relays require NIP-42 AUTH.
- **No ready DM**: Check relay connectivity and your master pubkey. You can disable ready DMs with `READY_ENABLED=0`.
- **Wallet not available**: Configure a Cashu mnemonic in setup before using wallet commands.
- **More visibility**: Run with `DEBUG=1` to see subscription filters, incoming events, publish targets, and AUTH challenges.
