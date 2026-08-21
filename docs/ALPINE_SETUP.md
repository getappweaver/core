## Dependencies

## Kill process
ps aux | grep -E "bun|5551" | grep -v grep

## Remove known SSH host
ssh-keygen -R vm-1903.lnvps.cloud

## Install

```bash
# git, bash, unzip (required for Bun setup), curl, and DNS tools
doas apk update
doas apk add unzip curl git bash bind-tools
# bun
curl -fsSL https://bun.sh/install | bash
# Make the PATH change permanent (for future logins)
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.profile
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.profile
source ~/.profile
# node
doas apk add nodejs npm
# ngit
curl -Ls https://ngit.dev/install.sh | bash
# opencode
curl -fsSL https://opencode.ai/install | bash
source /home/alpine/.profile
# pip
doas apk add py3-pip

# piper-tts

doas vi /etc/apk/repositories
# add `@testing https://dl-cdn.alpinelinux.org/alpine/edge/testing`
apk update
apk add py3-piper-tts@testing py3-flask

python3 -m piper.download_voices en_US-lessac-medium
echo "Hello from Alpine Linux. Piper TTS is working perfectly." | \
  python3 -m piper --model en_US-lessac-medium --output-file test.wav

# caddy
doas apk add caddy caddy-openrc
```

## Install AppWeaver

```bash
mkdir -p ~/my-workspace
cd ~/my-workspace
git clone --depth=1 https://github.com/getappweaver/core.git appweaver
cd appweaver
bun install

# AppWeaver Piper configuration
printf '\nBOT_PIPER_BINARY_PATH=python3 -m piper\n' >> .env
printf 'BOT_PIPER_MODEL_PATH=%s/piper/en_US-lessac-medium.onnx\n' "$HOME" >> .env
printf 'BOT_PIPER_SERVICE_ENABLED=1\n' >> .env
```

## Caddy Setup

Run these commands from the AppWeaver directory. The reverse DNS record provided
by the VPS is used as the public hostname.

```bash
PUBLIC_IP="$(ip -4 route get 1.1.1.1 | awk '{for (i=1; i<=NF; i++) if ($i == "src") print $(i+1)}')"
export DOMAIN="$(dig +short -x "$PUBLIC_IP" | sed 's/\.$//' | head -n1)"

if [ -z "$DOMAIN" ]; then
  echo "No reverse DNS hostname found for $PUBLIC_IP"
  exit 1
fi

echo "Detected public hostname: $DOMAIN"

doas tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
	reverse_proxy 127.0.0.1:5551
}
EOF

if grep -q '^BOT_SETUP_UI_ORIGIN=' .env 2>/dev/null; then
  sed -i "s|^BOT_SETUP_UI_ORIGIN=.*|BOT_SETUP_UI_ORIGIN=https://$DOMAIN|" .env
else
  printf '\nBOT_SETUP_UI_ORIGIN=https://%s\n' "$DOMAIN" >> .env
fi
```

```bash
doas caddy validate --config /etc/caddy/Caddyfile
# Enable and start Caddy
doas rc-update add caddy default
doas rc-service caddy restart
doas rc-service caddy status
```

## Opencode Setup

Opencode: copy from local: /home/alpine/.local/share/opencode/auth.json

```bash
ssh -i ~/.ssh/lnvps_ed25519 alpine@vm-1903.lnvps.cloud 'mkdir -p ~/.local/share/opencode'
scp -i ~/.ssh/lnvps_ed25519 ~/.local/share/opencode/auth.json alpine@vm-1903.lnvps.cloud:~/.local/share/opencode/auth.json
```

or

Edit `/etc/ssh/sshd_config` to have:
AllowTcpForwarding local
DisableForwarding no
PermitOpen 127.0.0.1:1455

then

```bash
ssh -i ~/.ssh/lnvps_ed25519 \
  -o ExitOnForwardFailure=yes \
  -N \
  -L 127.0.0.1:1455:127.0.0.1:1455 \
  alpine@vm-1903.lnvps.cloud
```

to forward port so local call would reach to VPS's opencode port so the auth on setup page would work.

## RUN

```bash
bun run scripts/run-start.ts --host 127.0.0.1
```

## Setup

Open the HTTPS setup URL printed by AppWeaver:

```text
https://vm-1903.lnvps.cloud/setup?secret=<generated-secret>
```
