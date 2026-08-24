# Alpine Setup

The setup script bootstraps Bash when necessary, installs AppWeaver's system and
user dependencies, downloads the default Piper voice, installs the project
packages, and configures Caddy using the machine's reverse DNS hostname.

Before running it, ensure:
- Preserve /var/lib/caddy between reinstalls. It contains the ACME account and issued certificates. Good for rate limits.
- The current user can run `doas` commands, or run the script as root.
- The server has a reverse DNS record pointing to its public IPv4 address.
- Inbound TCP ports 80 and 443 are open.

## Install

Run these commands on a fresh Alpine Linux server:

```bash
doas apk add git
mkdir my-workspace && cd my-workspace
git clone --depth=1 https://github.com/getappweaver/core.git appweaver
cd appweaver
./scripts/alpine-setup.sh
```

The script is safe to rerun. It updates existing AppWeaver settings instead of
adding duplicate entries to `.env` or `~/.profile`.

## OpenCode Authentication

The setup script configures the Alpine SSH server to allow OpenCode's browser
authentication callback on port 1455. Before starting AppWeaver, run this in a
separate terminal on your local machine:

```bash
ssh -i ~/.ssh/lnvps_ed25519 \
  -o ExitOnForwardFailure=yes \
  -N \
  -L 127.0.0.1:1455:127.0.0.1:1455 \
  alpine@<reverse-dns-hostname>
```

Keep this command running until authentication finishes.

## Run

Back in the Alpine SSH session, start AppWeaver:

```bash
. "$HOME/.profile"
bun run scripts/run-start.ts --host 127.0.0.1
```

## Setup

Open the HTTPS setup URL printed by AppWeaver. OpenCode authentication is
handled by the setup page.

```text
https://<reverse-dns-hostname>/setup?secret=<generated-secret>
```
