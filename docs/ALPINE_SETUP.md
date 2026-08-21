# Alpine Setup

The setup script bootstraps Bash when necessary, installs AppWeaver's system and
user dependencies, downloads the default Piper voice, installs the project
packages, and configures Caddy using the machine's reverse DNS hostname.

Before running it, ensure:

- The current user can run `doas` commands, or run the script as root.
- The server has a reverse DNS record pointing to its public IPv4 address.
- Inbound TCP ports 80 and 443 are open.

## Install

Run these commands on a fresh Alpine Linux server:

```bash
mkdir my-workspace && cd my-workspace
git clone --depth=1 https://github.com/getappweaver/core.git appweaver
cd appweaver
doas chmod a+x scripts/alpine-setup.sh
./scripts/alpine-setup.sh
```

`git` must already be available to clone the repository. If it is not included
in the Alpine image, install it first with `doas apk add git`.

The script is safe to rerun. It updates existing AppWeaver settings instead of
adding duplicate entries to `.env` or `~/.profile`.

## Run

```bash
bun run scripts/run-start.ts --host 127.0.0.1
```

## Setup

Open the HTTPS setup URL printed by AppWeaver. OpenCode authentication is
handled by the setup page.

```text
https://<reverse-dns-hostname>/setup?secret=<generated-secret>
```

## OpenCode Authentication

OpenCode's browser authentication callback uses port 1455 on the server. Edit
`/etc/ssh/sshd_config` on the Alpine server to allow only the required local
forward:

```text
AllowTcpForwarding local
DisableForwarding no
PermitOpen 127.0.0.1:1455
```

Restart the SSH daemon after saving the file:

```bash
doas rc-service sshd restart
```

On your local machine, open the tunnel before starting OpenCode authentication
from the setup page:

```bash
ssh -i ~/.ssh/lnvps_ed25519 \
  -o ExitOnForwardFailure=yes \
  -N \
  -L 127.0.0.1:1455:127.0.0.1:1455 \
  alpine@<reverse-dns-hostname>
```

Keep this command running until authentication finishes. It forwards the local
callback to OpenCode's port on the Alpine server without copying credential
files.
