#!/bin/sh
set -eu

# AppWeaver Automated Installer
# Usage:
#   curl -fsSL https://getappweaver.com/install.sh | sh
#   sh install.sh [--dir <path>] [--no-deps]

TARGET_DIR="${APPWEAVER_DIR:-appweaver}"
SKIP_DEPS="${APPWEAVER_SKIP_DEPS:-0}"
NO_START="${APPWEAVER_NO_START:-0}"
INITIAL_PATH="$PATH"

# Format & color setup
if [ -t 1 ]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  RED='\033[0;31m'
  RESET='\033[0m'
else
  BOLD=''
  DIM=''
  GREEN=''
  YELLOW=''
  BLUE=''
  RED=''
  RESET=''
fi

info() {
  printf "${BLUE}==>${RESET} ${BOLD}%s${RESET}\n" "$*"
}

success() {
  printf "${GREEN}  ✓${RESET} %s\n" "$*"
}

warn() {
  printf "${YELLOW}  !${RESET} %s\n" "$*"
}

error() {
  printf "${RED}  ✖ Error:${RESET} %s\n" "$*" >&2
}

die() {
  error "$*"
  exit 1
}

usage() {
  cat <<EOF
AppWeaver Installer

Usage:
  install.sh [options] [target-directory]

Options:
  -d, --dir <path>     Target installation directory (default: appweaver)
      --no-deps        Skip automatic installation of missing dependencies
      --no-start       Skip auto-starting AppWeaver after installation
      --host <host>    Bind address for AppWeaver web server (default: 127.0.0.1)
  -h, --help           Show this help message

Environment Variables:
  APPWEAVER_DIR        Target installation directory
  APPWEAVER_SKIP_DEPS  Set to 1 to skip automatic dependency installation
  APPWEAVER_NO_START   Set to 1 to skip auto-starting AppWeaver
  BOT_WEB_HOST         Bind address for AppWeaver web server
EOF
}

# Parse CLI arguments
while [ $# -gt 0 ]; do
  case "$1" in
    -d|--dir)
      if [ $# -lt 2 ]; then
        die "Option '$1' requires a directory path."
      fi
      TARGET_DIR="$2"
      shift 2
      ;;
    --no-deps)
      SKIP_DEPS=1
      shift
      ;;
    --no-start)
      NO_START=1
      shift
      ;;
    --host)
      if [ $# -lt 2 ]; then
        die "Option '$1' requires a host address."
      fi
      BOT_WEB_HOST="$2"
      export BOT_WEB_HOST
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      die "Unknown option: $1 (see --help for usage)"
      ;;
    *)
      TARGET_DIR="$1"
      shift
      ;;
  esac
done

# Check initial PATH containment for post-install shell setup hints
case ":$INITIAL_PATH:" in
  *":$HOME/.bun/bin:"*) BUN_IN_INITIAL_PATH=1 ;;
  *) BUN_IN_INITIAL_PATH=0 ;;
esac

case ":$INITIAL_PATH:" in
  *":$HOME/.local/bin:"*) LOCAL_IN_INITIAL_PATH=1 ;;
  *) LOCAL_IN_INITIAL_PATH=0 ;;
esac

# Pre-flight: Prepend user-space binary directories if they exist
if [ -d "$HOME/.bun/bin" ]; then
  PATH="$HOME/.bun/bin:$PATH"
fi
if [ -d "$HOME/.local/bin" ]; then
  PATH="$HOME/.local/bin:$PATH"
fi
export PATH

# Helper: Detect OS type
detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*)  echo "linux" ;;
    *)       echo "unknown" ;;
  esac
}

OS="$(detect_os)"

# Helper: Check if directory is empty
is_dir_empty() {
  if [ ! -d "$1" ]; then
    return 0
  fi
  for entry in "$1"/* "$1"/.*; do
    case "$entry" in
      "$1/*"|"$1/."|"$1/..") continue ;;
      *) return 1 ;;
    esac
  done
  return 0
}

printf "\n${BOLD}Installing AppWeaver${RESET}\n\n"

# Step 1: Pre-requisite checks (curl & git)
info "Checking essential tools..."

if ! command -v curl >/dev/null 2>&1; then
  die "'curl' is required to install AppWeaver. Please install curl and try again."
fi

if ! command -v git >/dev/null 2>&1; then
  if [ "$OS" = "macos" ]; then
    die "'git' is missing. Run 'xcode-select --install' to install command-line developer tools, then rerun this script."
  else
    die "'git' is missing. Please install git (e.g. 'sudo apt-get update && sudo apt-get install -y git') and rerun this script."
  fi
fi
success "Git and curl detected."

# Step 2: Dependency resolution (bun, opencode, ngit)
if [ "$SKIP_DEPS" = "1" ]; then
  info "Skipping automatic dependency installation (--no-deps active)."
else
  # Bun
  if command -v bun >/dev/null 2>&1; then
    success "Bun is already installed ($(bun --version 2>/dev/null || true))."
  else
    info "Installing Bun runtime..."
    if ! command -v bash >/dev/null 2>&1; then
      die "'bash' is required by the Bun installer. Please install bash and rerun."
    fi
    if [ "$OS" = "linux" ] && ! command -v unzip >/dev/null 2>&1; then
      die "'unzip' is required by the Bun installer on Linux. Please install unzip (e.g. 'sudo apt-get install -y unzip') and rerun."
    fi

    curl -fsSL https://bun.sh/install | bash

    PATH="$HOME/.bun/bin:$PATH"
    export PATH

    if ! command -v bun >/dev/null 2>&1; then
      die "Bun was installed but cannot be executed. Ensure $HOME/.bun/bin is executable."
    fi
    success "Bun installed successfully ($(bun --version))."
  fi

  # OpenCode (AI backend)
  if command -v opencode >/dev/null 2>&1; then
    success "OpenCode is already installed ($(opencode --version 2>/dev/null || true))."
  else
    info "Installing OpenCode AI runtime..."
    if bun install -g opencode-ai; then
      PATH="$HOME/.bun/bin:$PATH"
      export PATH
    else
      warn "Global bun install failed, trying official installer script..."
      curl -fsSL https://opencode.ai/install | bash
      PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
      export PATH
    fi

    if ! command -v opencode >/dev/null 2>&1; then
      warn "OpenCode was installed, but command 'opencode' was not immediately found on PATH."
    else
      success "OpenCode installed successfully."
    fi
  fi

  # ngit (Nostr Git remotes & app updates)
  if command -v ngit >/dev/null 2>&1; then
    success "ngit is already installed ($(ngit --version 2>/dev/null || true))."
  else
    info "Installing ngit (Nostr Git remote helper)..."
    curl -Ls https://ngit.dev/install.sh | bash
    PATH="$HOME/.local/bin:$PATH"
    export PATH

    if ! command -v ngit >/dev/null 2>&1; then
      warn "ngit installer ran, but 'ngit' was not immediately found on PATH."
    else
      success "ngit installed successfully."
    fi
  fi
fi

# Step 3: Clone AppWeaver
info "Setting up AppWeaver repository in '$TARGET_DIR'..."

if [ -d "$TARGET_DIR" ]; then
  if [ -f "$TARGET_DIR/package.json" ] && [ -d "$TARGET_DIR/.git" ]; then
    warn "Target directory '$TARGET_DIR' already contains an existing AppWeaver installation."
    info "Updating dependencies in existing directory..."
    cd "$TARGET_DIR"
    bun install
  elif ! is_dir_empty "$TARGET_DIR"; then
    die "Target directory '$TARGET_DIR' already exists and is not empty. Please choose another directory via --dir <path>."
  else
    git clone --depth=1 https://github.com/getappweaver/core.git "$TARGET_DIR"
    cd "$TARGET_DIR"
    bun install
  fi
else
  git clone --depth=1 https://github.com/getappweaver/core.git "$TARGET_DIR"
  cd "$TARGET_DIR"
  bun install
fi

success "AppWeaver core installed and dependencies prepared."

# Step 4: Completion Summary
BUN_VER="$(bun --version 2>/dev/null || echo 'not found')"
OPENCODE_VER="$(opencode --version 2>/dev/null || echo 'installed')"
GIT_VER="$(git --version 2>/dev/null || echo 'not found')"
NGIT_VER="$(ngit --version 2>/dev/null || echo 'installed')"

printf "\n${GREEN}${BOLD}✓ AppWeaver installation complete!${RESET}\n\n"
printf "  ${DIM}Directory :${RESET} %s\n" "$TARGET_DIR"
printf "  ${DIM}Bun       :${RESET} %s\n" "$BUN_VER"
printf "  ${DIM}OpenCode  :${RESET} %s\n" "$OPENCODE_VER"
printf "  ${DIM}Git       :${RESET} %s\n" "$GIT_VER"
printf "  ${DIM}ngit      :${RESET} %s\n\n" "$NGIT_VER"

NEEDS_PATH_EXPORT=0
PATH_EXPORTS=""

if [ "$BUN_IN_INITIAL_PATH" = "0" ] && [ -d "$HOME/.bun/bin" ]; then
  NEEDS_PATH_EXPORT=1
  PATH_EXPORTS="\$HOME/.bun/bin"
fi

if [ "$LOCAL_IN_INITIAL_PATH" = "0" ] && [ -d "$HOME/.local/bin" ]; then
  NEEDS_PATH_EXPORT=1
  if [ -n "$PATH_EXPORTS" ]; then
    PATH_EXPORTS="$PATH_EXPORTS:\$HOME/.local/bin"
  else
    PATH_EXPORTS="\$HOME/.local/bin"
  fi
fi

if [ "$NEEDS_PATH_EXPORT" = "1" ]; then
  printf "${YELLOW}${BOLD}Notice:${RESET} User-space binaries were installed to your home directory.\n"
  printf "To use them in future terminal sessions, ensure your shell profile includes:\n\n"
  printf "  ${BOLD}export PATH=\"%s:\$PATH\"${RESET}\n\n" "$PATH_EXPORTS"
fi

printf "${DIM}To start AppWeaver again later: cd %s && bun run start${RESET}\n\n" "$TARGET_DIR"

if [ "$NO_START" = "1" ]; then
  printf "${BOLD}To start AppWeaver:${RESET}\n"
  printf "  cd %s\n" "$TARGET_DIR"
  printf "  bun run start\n\n"
  exit 0
fi

if (exec </dev/tty) 2>/dev/null; then
  info "Starting AppWeaver..."
  exec bun run start </dev/tty
else
  warn "No interactive terminal (/dev/tty) detected; skipping auto-start."
  printf "${BOLD}To start AppWeaver:${RESET}\n"
  printf "  cd %s\n" "$TARGET_DIR"
  printf "  bun run start\n\n"
fi
