#!/usr/bin/env bash
set -euo pipefail

if [ "${ENABLE_VNC:-0}" = "1" ]; then
  Xvfb :99 -screen 0 1280x800x24 >/tmp/xvfb.log 2>&1 &
  xfce4-session >/tmp/xfce.log 2>&1 &
  x11vnc -display :99 -forever -shared -nopw -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
  websockify --web=/usr/share/novnc/ 6080 localhost:5900 >/tmp/novnc.log 2>&1 &
fi

if [ ! -f package.json ]; then
  shopt -s dotglob nullglob
  entries=(*)
  shopt -u dotglob nullglob

  if [ "${#entries[@]}" -ne 0 ]; then
    echo "Expected /workspace/appweaver to be empty or contain package.json." >&2
    echo "Current contents prevent cloning ${APPWEAVER_REPO_URL}." >&2
    exit 1
  fi

  git clone --branch "${APPWEAVER_GIT_REF}" "${APPWEAVER_REPO_URL}" .
fi

bun install --frozen-lockfile
exec bun run start
