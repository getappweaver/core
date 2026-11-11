#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${APPWEAVER_TMUX_SESSION:-appweaver}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APPWEAVER_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

case "${1:-}" in
  help|--help|-h)
    cat <<EOF
Usage: bun run start:tmux [attach|stop|status|--help] [arguments...]

Runs AppWeaver inside a persistent tmux session so it keeps running
even if your SSH connection drops.

Commands:
  (no command)  Start AppWeaver in tmux (or attach if already running)
  attach        Attach to the running tmux session
  stop, kill    Stop the running tmux session
  status        Check if the tmux session is active
  help, --help  Show this help message

Any additional flags (e.g. --host 127.0.0.1) are passed directly to run-start.ts.

To detach from tmux without stopping AppWeaver:
  Press 'Ctrl+b', release, then press 'd'.
EOF
    exit 0
    ;;
esac

if ! command -v tmux >/dev/null 2>&1; then
  echo "Error: tmux is not installed." >&2
  echo "Install it using your package manager (e.g. 'apk add tmux' on Alpine, 'apt install tmux' on Debian/Ubuntu)." >&2
  exit 1
fi

case "${1:-}" in
  attach)
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      exec tmux attach-session -t "$SESSION_NAME"
    else
      echo "No active tmux session named '$SESSION_NAME' found." >&2
      exit 1
    fi
    ;;
  stop|kill)
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      tmux kill-session -t "$SESSION_NAME"
      echo "Stopped tmux session '$SESSION_NAME'."
      exit 0
    else
      echo "No active tmux session named '$SESSION_NAME' found."
      exit 0
    fi
    ;;
  status)
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      echo "AppWeaver is running in tmux session '$SESSION_NAME'."
      exit 0
    else
      echo "AppWeaver tmux session '$SESSION_NAME' is not running."
      exit 1
    fi
    ;;
  help|--help|-h)
    cat <<EOF
Usage: bun run start:tmux [attach|stop|status|--help] [arguments...]

Runs AppWeaver inside a persistent tmux session so it keeps running
even if your SSH connection drops.

Commands:
  (no command)  Start AppWeaver in tmux (or attach if already running)
  attach        Attach to the running tmux session
  stop, kill    Stop the running tmux session
  status        Check if the tmux session is active
  help, --help  Show this help message

Any additional flags (e.g. --host 127.0.0.1) are passed directly to run-start.ts.

To detach from tmux without stopping AppWeaver:
  Press 'Ctrl+b', release, then press 'd'.
EOF
    exit 0
    ;;
esac

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "Session '$SESSION_NAME' is already running."
  if [ -t 0 ] && [ -t 1 ]; then
    echo "Attaching to session... (Press Ctrl+b then d to detach)"
    exec tmux attach-session -t "$SESSION_NAME"
  else
    echo "To attach, run: bun run start:tmux attach (or tmux attach -t $SESSION_NAME)"
    exit 0
  fi
fi

cmd=("bun" "run" "scripts/run-start.ts")
if [ "$#" -gt 0 ]; then
  cmd+=("$@")
fi

quoted_cmd="$(printf '%q ' "${cmd[@]}")"

tmux_cmd="[ -f \"\$HOME/.profile\" ] && . \"\$HOME/.profile\"; export PATH=\"\${BUN_INSTALL:-\$HOME/.bun}/bin:\$HOME/.local/bin:\$HOME/.opencode/bin:\$PATH\"; cd $(printf '%q' "$APPWEAVER_DIR") && $quoted_cmd; exit_code=\$?; echo; echo \"AppWeaver exited with status \$exit_code. Press Enter to close window.\"; read -r _"

tmux new-session -d -s "$SESSION_NAME" -c "$APPWEAVER_DIR" "$tmux_cmd"

if [ -t 0 ] && [ -t 1 ]; then
  echo "Started AppWeaver inside tmux session '$SESSION_NAME'."
  echo "Attaching... (Press Ctrl+b then d to detach)"
  exec tmux attach-session -t "$SESSION_NAME"
else
  echo "AppWeaver started in background tmux session '$SESSION_NAME'."
  echo "Attach anytime with: bun run start:tmux attach (or tmux attach -t $SESSION_NAME)"
fi
