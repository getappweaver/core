#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "AppWeaver source verification failed: $*" >&2
  echo "No dependencies installed or application started. See ALPINE_DOCKER.md for volume upgrades." >&2
  exit 1
}

requested_sha="${APPWEAVER_GIT_SHA:-}"
if [[ ! "$requested_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
  fail "APPWEAVER_GIT_SHA is required and must be a full 40-character hexadecimal commit SHA."
fi
requested_sha="${requested_sha,,}"

if [ ! -f package.json ]; then
  shopt -s dotglob nullglob
  entries=(*)
  shopt -u dotglob nullglob

  if [ "${#entries[@]}" -ne 0 ]; then
    fail "Expected an empty /workspace/appweaver or an existing checkout with package.json; existing files were left untouched."
  fi

  git init . || fail "Cannot initialize the empty workspace."
  git remote add origin "${APPWEAVER_REPO_URL}" || fail "Cannot configure APPWEAVER_REPO_URL."
  git fetch --depth=1 --no-tags origin "$requested_sha" \
    || fail "Commit $requested_sha is unavailable from ${APPWEAVER_REPO_URL}. A partial checkout may remain; inspect it before retrying."
  fetched_sha="$(git rev-parse --verify 'FETCH_HEAD^{commit}')" \
    || fail "Cannot resolve the fetched commit."
  [ "$fetched_sha" = "$requested_sha" ] || fail "Fetched commit $fetched_sha does not match $requested_sha."
  git -c advice.detachedHead=false checkout --detach "$requested_sha" \
    || fail "Cannot check out commit $requested_sha."
fi

# Verify on every start, including restarts with a persistent checkout.
repo_root="$(git rev-parse --show-toplevel)" || fail "Existing workspace is not a Git checkout."
[ "$(cd "$repo_root" && pwd -P)" = "$(pwd -P)" ] \
  || fail "The workspace must be the Git repository root."
actual_sha="$(git rev-parse --verify 'HEAD^{commit}')" || fail "Cannot verify workspace HEAD."
[ "$actual_sha" = "$requested_sha" ] \
  || fail "Workspace HEAD is $actual_sha; requested $requested_sha. Source and persistent data were left untouched."
[ -f package.json ] || fail "Verified commit has no package.json."
# Check the index and working tree separately so staged edits cannot be hidden
# by restoring only the working copy. Runtime data and installed plugins are
# untracked/ignored in the core repository and are deliberately not inspected.
git diff --cached --quiet --no-ext-diff --ignore-submodules=none HEAD -- . \
  || fail "Tracked files have staged changes or could not be verified. Inspect git diff --cached; preserve your changes before restoring the pinned core source."
git diff --quiet --no-ext-diff --ignore-submodules=none -- . \
  || fail "Tracked files have unstaged changes or could not be verified. Inspect git diff; preserve your changes before restoring the pinned core source."
echo "AppWeaver core HEAD verified: $actual_sha"

mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"

bun install --frozen-lockfile
exec bun run start
