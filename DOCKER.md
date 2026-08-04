# AppWeaver Docker Setup

Docker is the recommended VPS deployment path. The Docker image is a runtime environment, not the source of truth for AppWeaver code. It includes Bun, OpenCode, Cursor Agent, Chromium/Playwright dependencies, ngit, Piper, and optional VNC/noVNC support.

Clone AppWeaver on the host if you have not already:

```bash
git clone --depth=1 https://github.com/getappweaver/core.git appweaver
cd appweaver
```

Build the runtime image:

```bash
docker build -t appweaver-runtime .
```

Run AppWeaver with a persistent AppWeaver folder mounted into the container:

```bash
docker run -d \
  --name appweaver \
  --restart unless-stopped \
  -p 127.0.0.1:5551:5551 \
  -p 127.0.0.1:1455:1455 \
  -v "$PWD:/workspace/appweaver" \
  appweaver-runtime
```

Open the setup URL printed in the logs:

```bash
docker logs -f appweaver
```

The bot's `parent` workspace is `/workspace`, which lets parent-scoped assets such as `opencode.json`, `AGENTS.md`, and `.opencode/agents` live outside the AppWeaver folder while still being available to OpenCode.

Core and app state stays in the mounted AppWeaver folder. That includes `.env`, `dm-bot.sqlite*`, `plugins/`, `plugins.json`, browser profiles, generated web assets, and app-managed data.

To update AppWeaver core:

```bash
git pull
docker restart appweaver
```

To update runtime tools, rebuild the image and recreate the container with the same mount.

## Secure Setup Access

The setup URL can configure secrets such as bot keys, relay settings, provider credentials, and wallet settings. Treat it as a local-only admin interface.

- Do not expose setup over public plain HTTP.
- Bind Docker ports on the host to `127.0.0.1`, not all interfaces.
- If AppWeaver runs on a VPS, keep port `5551` closed to the internet and use SSH port forwarding.
- If you intentionally expose setup remotely, put HTTPS in front of it with a trusted tunnel or reverse proxy such as Caddy, Traefik, Tailscale HTTPS, or Cloudflare Tunnel.

For VPS setup, start the container on the VPS with localhost-only port publishing, then from your laptop run:

```bash
ssh -L 5551:127.0.0.1:5551 -L 1455:127.0.0.1:1455 user@VPS_PUBLIC_IP
```

Then open the setup URL from the logs on your laptop.

Although the browser URL uses `http://`, traffic between your laptop and the VPS is encrypted inside SSH. Plain HTTP exists only on loopback interfaces at each end of the tunnel.

Optional browser/VNC ports should also be localhost-only if enabled:

```bash
-p 127.0.0.1:5900:5900 -p 127.0.0.1:6080:6080 -e ENABLE_VNC=1
```
