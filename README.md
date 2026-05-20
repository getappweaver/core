# [AppWeaver](https://getappweaver.com)

Open-source app hub for running AI-powered tools from a project or workspace folder you control.

## What It Does

- Install AppWeaver into a project or workspace folder and add the apps you want.
- Use focused tools through the web interface, web chat, local terminal input, or your favourite Nostr chat app.
- Use OpenCode by default for the richest model/provider options, or Cursor Agent if that fits your workflow better.
- Keep data local: configuration, sessions, app data, wallet data, and browser profiles live on your machine or server.

## Key Features

- **Easy UI setup** — Clone the repo, run `bun install` and `bun run start`, then follow the web setup interface.
- **AI-powered apps** — Install apps for todos, bookmarks, jobs, files, browser actions, publishing, journaling, and more.
- **Multiple control surfaces** — Use the web UI, Nostr DMs, terminal chat, or AI-agent tool calls.
- **OpenCode-first backend** — OpenCode supports richer model/provider selection and local provider configuration; Cursor Agent is also supported.
- **Bitcoin-native paid AI** — Optional Cashu/Routstr flow for pay-as-you-go model usage.
- **Local-first data** — AppWeaver stores state in folders you control.

Built with Bun, TypeScript, nostr-tools, OpenCode, Cursor Agent support, Solid, and SQLite.

**Links:** [Nostr](https://nostr.com/) · [NIP-17 encrypted DMs](https://github.com/nostr-protocol/nips/blob/master/17.md) · [OpenCode](https://opencode.ai) · [Cursor](https://cursor.com) · [Cashu](https://cashu.space) · [Routstr](https://routstr.com) · [ngit](https://gitworkshop.dev/ngit)

## Install And Setup

AppWeaver is meant to live inside the project or workspace you want it to operate on. The recommended folder name is `appweaver`.

You can install AppWeaver natively, or use [Docker](#docker) if you want the runtime dependencies packaged for you.

```bash
git clone https://github.com/getappweaver/core.git appweaver
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

| Tool    | Why it matters                                |
| ------- | --------------------------------------------- |
| Bun     | Runtime, scripts, package install, web build  |
| Node.js | Required by parts of the AI/backend toolchain |
| Git     | Core and app updates                          |
| ngit    | Nostr Git remotes, app installs, app updates  |


Optional:

| Tool                   | Why it matters                                            |
| ---------------------- | --------------------------------------------------------- |
| OpenCode               | Recommended AI backend with richer model/provider support |
| Cursor Agent (`agent`) | Alternative AI backend                                    |
| Python (`python3`)     | Useful if installing Piper via `pip`                      |
| Piper                  | Local text-to-speech support                              |


Common install links:

- Bun: [https://bun.sh/docs/installation](https://bun.sh/docs/installation)
- Node.js: [https://nodejs.org/](https://nodejs.org/)
- Git: [https://git-scm.com/downloads](https://git-scm.com/downloads)
- ngit: [https://gitworkshop.dev/ngit](https://gitworkshop.dev/ngit)
- OpenCode: [https://opencode.ai/](https://opencode.ai/)
- Cursor Agent: [https://docs.cursor.com/en/cli/installation](https://docs.cursor.com/en/cli/installation)
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

### Official Apps

| App | Description |
| --- | ----------- |
| **Todo app** | Create, organize, and draft task updates with AI help. |
| **File manager** | Browse workspace trees, inspect files, and manage project content. |
| **Job scheduler** | Schedule one-off and recurring jobs for AppWeaver to run later. |
| **Bookmark manager** | Save, search, categorize, and publish bookmark collections. |
| **Browser actions** | Drive browser sessions for web automation and research tasks. |
| **Captain's Log** | Adds private journaling, searchable notes, drafts, and optional publishing to Nostr. |

## Cashu And Routstr

Routstr is optional. Use it when you want pay-as-you-go AI model usage with sats instead of a separate subscription.

AppWeaver's built-in wallet stores Cashu eCash tokens. It does not mint via Lightning directly; use an external Cashu wallet such as [cashu.me](https://cashu.me) or Minibits to receive sats, then paste the Cashu token into AppWeaver.

Basic flow:

1. Configure or generate a Cashu wallet in setup.
2. Set a mint with `/wallet mint <mintURL>` if needed.
3. Receive tokens with `/wallet receive <token>`.
4. Switch to Routstr with `/ai provider set routstr`.
5. Deposit with `/ai provider deposit <sats>` or append a budget suffix to a prompt, such as `fix this bug !!1000sats`.

Useful commands:

| Command                       | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| `/wallet mint [url]`          | Show or set your Cashu mint URL                 |
| `/wallet balance`             | Show local wallet balance                       |
| `/wallet receive <token>`     | Receive a Cashu token                           |
| `/wallet history`             | Show recent spend history                       |
| `/ai provider deposit <sats>` | Move sats to a Routstr session                  |
| `/ai provider refund`         | Recover unspent Routstr balance                 |
| `/ai provider balance`        | Check Routstr session balance                   |
| `/ai provider budget <sats>`  | Set default budget                              |
| `/ai provider status`         | Show provider, session, mint, model, and budget |


## Docker

Docker is the recommended VPS deployment path. The Docker image is a runtime environment, not the source of truth for AppWeaver code. It includes Bun, OpenCode, Cursor Agent, Chromium/Playwright dependencies, ngit, Piper, and optional VNC/noVNC support.

Clone AppWeaver on the host if you have not already:

```bash
git clone https://github.com/getappweaver/core.git appweaver
cd appweaver
```

Build the runtime image:

```bash
docker build -t appweaver-runtime .
```

Run AppWeaver with a persistent AppWeaver folder mounted into the container:

```bash
docker run -d \
  --name appweaver \
  --restart unless-stopped \
  -p 127.0.0.1:5551:5551 \
  -p 127.0.0.1:1455:1455 \
  -v "$PWD:/workspace/appweaver" \
  appweaver-runtime
```

Open the setup URL printed in the logs:

```bash
docker logs -f appweaver
```

The bot's `parent` workspace is `/workspace`, which lets parent-scoped assets such as `opencode.json`, `AGENTS.md`, and `.opencode/agents` live outside the AppWeaver folder while still being available to OpenCode.

Core and app state stays in the mounted AppWeaver folder. That includes `.env`, `dm-bot.sqlite*`, `plugins/`, `plugins.json`, browser profiles, generated web assets, and app-managed data.

To update AppWeaver core:

```bash
git pull
docker restart appweaver
```

To update runtime tools, rebuild the image and recreate the container with the same mount.

### Secure Setup Access

The setup URL can configure secrets such as bot keys, relay settings, provider credentials, and wallet settings. Treat it as a local-only admin interface.

- Do not expose setup over public plain HTTP.
- Bind Docker ports on the host to `127.0.0.1`, not all interfaces.
- If AppWeaver runs on a VPS, keep port `5551` closed to the internet and use SSH port forwarding.
- If you intentionally expose setup remotely, put HTTPS in front of it with a trusted tunnel or reverse proxy such as Caddy, Traefik, Tailscale HTTPS, or Cloudflare Tunnel.

For VPS setup, start the container on the VPS with localhost-only port publishing, then from your laptop run:

```bash
ssh -L 5551:127.0.0.1:5551 -L 1455:127.0.0.1:1455 user@VPS_PUBLIC_IP
```

Then open the setup URL from the logs on your laptop.

Although the browser URL uses `http://`, traffic between your laptop and the VPS is encrypted inside SSH. Plain HTTP exists only on loopback interfaces at each end of the tunnel.

Optional browser/VNC ports should also be localhost-only if enabled:

```bash
-p 127.0.0.1:5900:5900 -p 127.0.0.1:6080:6080 -e ENABLE_VNC=1
```

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

When changing AppWeaver core code, run targeted checks where possible or `bun run lint` for broad changes. See [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) for contributor and AI-agent workflow details.

If you want AppWeaver to work on its own core code, set the workspace to `appweaver` in setup or the web UI.

For app/plugin development, see [PLUGINS.md](PLUGINS.md).

## Troubleshooting

- **No setup page opens**: Copy the full setup URL from the terminal or Docker logs into your browser. Confirm port `5551` is reachable locally.
- **A dependency is missing**: Install it, restart AppWeaver, then reload setup. Setup checks the server process `PATH`.
- **Nostr DMs do not arrive**: Confirm `BOT_RELAYS` matches the relay URLs your Nostr client uses for encrypted DMs. Some relays require NIP-42 AUTH.
- **No ready DM**: Check relay connectivity and your master pubkey. You can disable ready DMs with `READY_ENABLED=0`.
- **Wallet not available**: Configure a Cashu mnemonic in setup before using wallet or Routstr commands.
- **More visibility**: Run with `DEBUG=1` to see subscription filters, incoming events, publish targets, and AUTH challenges.
