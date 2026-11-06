# AppWeaver Alpine Docker Setup

The Alpine image is a reduced runtime for managed hosting. It includes Bun,
OpenCode, ngit, Piper, Git, and SSH tooling. It intentionally does not include
Chromium, Playwright browsers, a desktop environment, or VNC. Use
the existing [`Dockerfile`](Dockerfile) and [`DOCKER.md`](DOCKER.md) when those
features are required.

## Build and Run

Build from a clean checkout, supplying its full 40-character commit SHA:

```bash
docker build --platform linux/amd64 -f Dockerfile.alpine \
  --build-arg APPWEAVER_GIT_SHA="$(git rev-parse --verify 'HEAD^{commit}')" \
  -t appweaver-alpine .
```

The selected commit must already be available from the configured remote.
Application source is fetched at container startup, not copied from the local
build context: uncommitted local application changes are not included in that
checkout. Commit and make the intended source available on the remote before
building an image for deployment.

The `Container` GitHub Actions workflow passes its actual checked-out commit as
`APPWEAVER_GIT_SHA` and sets the OCI revision label (image metadata) to the same
commit. Published images therefore select their intended application commit by
default. The SHA must be fetchable from `APPWEAVER_REPO_URL`, which defaults to
`https://github.com/getappweaver/core.git`.

For managed deployments, pin the image by digest as well: the digest fixes the
runtime image; `APPWEAVER_GIT_SHA` selects the application checkout in the volume.
Obtain the digest from CI publication output or
`docker buildx imagetools inspect ghcr.io/getappweaver/core:alpine`. Verify the
selected platform is `linux/amd64`, the image embeds the intended SHA, and its
entrypoint verifies that SHA. An OCI label alone does not verify running source.

Run with a persistent volume (replace the digest placeholder):

```bash
docker volume create appweaver-data
docker run -d \
  --name appweaver-alpine \
  --restart unless-stopped \
  --platform linux/amd64 --read-only --tmpfs /tmp:rw,nosuid,nodev \
  -p 127.0.0.1:5551:5551 \
  -v appweaver-data:/workspace/appweaver \
  ghcr.io/getappweaver/core@sha256:<verified-digest>
```

The image runs as UID/GID 1000; provision volume/bind-mount ownership accordingly.
An empty volume is initialized with an exact-commit fetch and detached checkout.
On **every container start**, including restarts, the entrypoint verifies that the
workspace is a Git root, `HEAD` equals `APPWEAVER_GIT_SHA`, and tracked files have
no staged or unstaged changes before running `bun install --frozen-lockfile` and
`bun run start`. Missing/invalid SHAs, unavailable commits, revision mismatches,
and tracked-file changes fail without branch/tag fallback.
Nonempty incomplete workspaces are refused; a failed initial fetch may leave a
partial checkout requiring operator inspection. Existing source is never
automatically reset, cleaned, or upgraded.

The check covers tracked core files, including dependency manifests and
lockfiles. It leaves untracked/ignored runtime files alone, including
`plugins.json`, generated registrations, installed plugins, credentials, and
databases. The tracked `generated/plugins/index.ts` stub remains checked; runtime
generation writes the separate ignored `generated/plugins.ts`. Independently
installed plugin code and other untracked files are outside this source check,
so this is not a verification of every executable file in the workspace.

## Networking

Basic startup uses TCP 5551 without host networking or elevated privileges.
The image does not block UDP, and `EXPOSE` is not a firewall. Optional apps such
as FIPS additionally require UDP egress and working NAT traversal. Docker bridge
NAT and VPS/provider firewalls can affect peer reachability; successful STUN
discovery does not guarantee hole punching. The current FIPS transport binds
dynamic UDP ports, so publishing one arbitrary fixed UDP port is insufficient.

The setup page is an admin interface. Bind port 5551 to loopback unless a trusted
TLS reverse proxy protects it. API-key and device-code OpenCode providers work
without additional ports. Providers that require a browser callback to localhost
need a separate tunnel and are not suitable for managed deployments without one.

## Updates and Persistent State

Before updating, stop the application and all other volume writers, then back up
the **whole volume**, including dotfiles, permissions, and SQLite databases with
their WAL/SHM/journal sidecars. Do not copy live SQLite files independently; online
backups require SQLite backup APIs and coordinated non-database state snapshots.
Preserve:

- `.env`, original encryption key material, and externally supplied secrets such
  as `BOT_KEY`, so stored secrets remain decryptable.
- Core databases, `plugins.json`, and all installed plugin configuration/data.
  Keep `plugins/fips/db.sqlite` and sidecars to retain FIPS identity, pairings,
  peers, and relay settings.
- `.data/` HOME/XDG credentials/configuration, `.appweaver/`, `.opencode/`, and any
  other workspace data or external mounts.

A new image does not update an existing checkout. With the app stopped, review
`git status`, preserve local edits/untracked files separately, and fetch the target
SHA from the trusted repository. Verify the fetched commit, then explicitly run
`git checkout --no-overwrite-ignore --detach <full-target-sha>`. Resolve conflicts
without forced checkout/reset/clean; preserve runtime data and plugin-local work.
Recreate the container with the matching image digest and volume, and confirm its
logged `HEAD` matches the intended SHA.

Database migrations can prevent source-only rollback. Retain the old image/SHA
pair and pre-upgrade snapshot; restore the complete snapshot with all writers
stopped if rollback requires it. Restoring a snapshot loses subsequent writes.
