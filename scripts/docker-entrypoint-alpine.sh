#!/usr/bin/env bash
set -euo pipefail

if [ ! -f package.json ]; then
  shopt -s dotglob nullglob
  entries=(*)
  shopt -u dotglob nullglob

  if [ "${#entries[@]}" -ne 0 ]; then
    echo "Expected /workspace/appweaver to be empty or contain package.json." >&2
    echo "Current contents prevent cloning ${APPWEAVER_REPO_URL}." >&2
    exit 1
  fi

  git clone --depth=1 --branch "${APPWEAVER_GIT_REF}" "${APPWEAVER_REPO_URL}" .
fi

mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"

bun install --frozen-lockfile
exec bun run start
