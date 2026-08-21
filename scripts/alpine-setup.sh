#!/bin/sh

if [ -z "${BASH_VERSION:-}" ]; then
  if ! command -v bash >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
      apk update
      apk add bash
    else
      command -v doas >/dev/null 2>&1 || {
        printf 'Error: doas is required to install Bash.\n' >&2
        exit 1
      }
      doas apk update
      doas apk add bash
    fi
  fi

  exec bash "$0" "$@"
fi

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly APPWEAVER_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
readonly PROFILE_FILE="$HOME/.profile"
readonly ENV_FILE="$APPWEAVER_DIR/.env"
readonly PIPER_DIR="$HOME/piper"
readonly PIPER_MODEL="$PIPER_DIR/en_US-lessac-medium.onnx"
readonly TESTING_REPOSITORY='@testing https://dl-cdn.alpinelinux.org/alpine/edge/testing'

if [ "${EUID}" -eq 0 ]; then
  ROOT=()
else
  ROOT=(doas)
fi

info() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

run_root() {
  "${ROOT[@]}" "$@"
}

append_line_once() {
  local file="$1"
  local line="$2"

  touch "$file"
  grep -Fqx "$line" "$file" 2>/dev/null || printf '%s\n' "$line" >> "$file"
}

set_env() {
  local key="$1"
  local value="$2"
  local line="${key}=${value}"
  local temporary_file

  touch "$ENV_FILE"
  temporary_file="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
  awk -v key="$key" -v line="$line" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 {
      if (!found) print line
      found = 1
      next
    }
    { print }
    END { if (!found) print line }
  ' "$ENV_FILE" > "$temporary_file"
  mv "$temporary_file" "$ENV_FILE"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

[ -f /etc/alpine-release ] || fail 'This script must be run on Alpine Linux.'
[ -f "$APPWEAVER_DIR/package.json" ] || fail 'Run this script from an AppWeaver checkout.'

if [ "${EUID}" -ne 0 ] && ! command_exists doas; then
  fail 'doas is required when the script is run as a non-root user.'
fi

info 'Configuring Alpine repositories'
if ! grep -Fqx "$TESTING_REPOSITORY" /etc/apk/repositories; then
  printf '%s\n' "$TESTING_REPOSITORY" | run_root tee -a /etc/apk/repositories >/dev/null
fi

run_root apk update

info 'Installing system packages'
run_root apk add \
  bash \
  bind-tools \
  caddy \
  caddy-openrc \
  curl \
  git \
  iproute2 \
  nodejs \
  npm \
  py3-flask \
  py3-pip \
  py3-piper-tts@testing \
  unzip

info 'Configuring user PATH'
append_line_once "$PROFILE_FILE" 'export BUN_INSTALL="$HOME/.bun"'
append_line_once "$PROFILE_FILE" 'export PATH="$BUN_INSTALL/bin:$HOME/.local/bin:$HOME/.opencode/bin:$PATH"'
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$HOME/.local/bin:$HOME/.opencode/bin:$PATH"

if ! command_exists bun; then
  info 'Installing Bun'
  curl -fsSL https://bun.sh/install | bash
fi

if ! command_exists ngit; then
  info 'Installing ngit'
  curl -fsSL https://ngit.dev/install.sh | bash
fi

if ! command_exists opencode; then
  info 'Installing OpenCode'
  curl -fsSL https://opencode.ai/install | bash
fi

info 'Installing AppWeaver dependencies'
cd "$APPWEAVER_DIR"
bun install --frozen-lockfile

info 'Installing the Piper voice model'
mkdir -p "$PIPER_DIR"
if [ ! -f "$PIPER_MODEL" ]; then
  (
    cd "$PIPER_DIR"
    python3 -m piper.download_voices en_US-lessac-medium
  )
fi

PIPER_TEST_FILE="$(mktemp /tmp/appweaver-piper-test.XXXXXX)"
trap 'rm -f "$PIPER_TEST_FILE"' EXIT
printf '%s\n' 'Hello from Alpine Linux. Piper TTS is working.' | \
  python3 -m piper --model "$PIPER_MODEL" --output-file "$PIPER_TEST_FILE"

info 'Configuring AppWeaver'
set_env BOT_PIPER_BINARY_PATH '"python3 -m piper"'
set_env BOT_PIPER_MODEL_PATH "$PIPER_MODEL"
set_env BOT_PIPER_SERVICE_ENABLED '1'

info 'Detecting the public hostname'
if ! ROUTE_OUTPUT="$(ip -4 route get 1.1.1.1 2>&1)"; then
  fail "Could not query the public IPv4 route: $ROUTE_OUTPUT"
fi

PUBLIC_IP="$(awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }' <<< "$ROUTE_OUTPUT")"
[ -n "$PUBLIC_IP" ] || fail 'Could not detect the public IPv4 address.'

if ! REVERSE_DNS="$(dig +short -x "$PUBLIC_IP" 2>&1)"; then
  fail "Reverse DNS lookup failed for $PUBLIC_IP: $REVERSE_DNS"
fi

DOMAIN="$(awk 'NF { sub(/\.$/, ""); print; exit }' <<< "$REVERSE_DNS")"
[ -n "$DOMAIN" ] || fail "No reverse DNS hostname found for $PUBLIC_IP."
printf 'Detected public hostname: %s\n' "$DOMAIN"

set_env BOT_SETUP_UI_ORIGIN "https://$DOMAIN"

readonly CADDY_CONFIG="$(mktemp /tmp/appweaver-caddy.XXXXXX)"
trap 'rm -f "$PIPER_TEST_FILE" "$CADDY_CONFIG"' EXIT
printf '%s {\n\treverse_proxy 127.0.0.1:5551\n}\n' "$DOMAIN" > "$CADDY_CONFIG"
caddy validate --config "$CADDY_CONFIG" --adapter caddyfile
run_root tee /etc/caddy/Caddyfile < "$CADDY_CONFIG" >/dev/null
run_root caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
run_root rc-update add caddy default
run_root rc-service caddy restart

info 'Alpine setup complete'
printf 'Start AppWeaver from %s with:\n\n' "$APPWEAVER_DIR"
printf '  . "$HOME/.profile"\n'
printf '  bun run scripts/run-start.ts --host 127.0.0.1\n\n'
printf 'Then open the HTTPS setup URL printed by AppWeaver.\n'
