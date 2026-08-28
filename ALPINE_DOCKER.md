# AppWeaver Alpine Docker Setup

The Alpine image is a reduced runtime for managed hosting. It includes Bun,
OpenCode, ngit, Piper, Git, and SSH tooling. It intentionally does not include
Chromium, Playwright browsers, Cursor Agent, a desktop environment, or VNC. Use
the existing [`Dockerfile`](Dockerfile) and [`DOCKER.md`](DOCKER.md) when those
features are required.

Build the Alpine runtime explicitly:

```bash
docker build -f Dockerfile.alpine -t appweaver-alpine .
```

Run it with a persistent AppWeaver folder:

```bash
docker run -d \
  --name appweaver-alpine \
  --restart unless-stopped \
  -p 127.0.0.1:5551:5551 \
  -v "$PWD:/workspace/appweaver" \
  appweaver-alpine
```

The image runs as UID/GID 1000. Ensure an existing bind-mounted checkout is
writable by that user. If the mount is empty, the entrypoint clones the branch
selected by `APPWEAVER_GIT_REF` from `APPWEAVER_REPO_URL`. The checkout, `.env`,
`.data/`, databases, installed apps, credentials, and app-managed data remain in
the mounted folder.

The setup page is an admin interface. Bind port 5551 to loopback unless a trusted
TLS reverse proxy protects it. API-key and device-code OpenCode providers work
without additional ports. Providers that require a browser callback to localhost
need a separate tunnel and are not suitable for managed deployments without one.

The `Container` GitHub Actions workflow publishes this image for `linux/amd64` as
`ghcr.io/getappweaver/core:alpine`.
