FROM mcr.microsoft.com/playwright:v1.59.1-noble

ARG DEBIAN_FRONTEND=noninteractive
ARG PIPER_VERSION=2023.11.14-2
ARG PIPER_VOICE=en_US-libritts_r-medium

ENV BUN_INSTALL=/root/.bun \
    PATH=/root/.bun/bin:/root/.local/bin:/usr/local/bin:$PATH \
    DISPLAY=:99 \
    BOT_WEB_HOST=0.0.0.0 \
    BOT_WEB_UI_PORT=5552 \
    BOT_PIPER_BINARY_PATH=/opt/piper/piper \
    BOT_PIPER_MODEL_PATH=/opt/piper/voices/${PIPER_VOICE}.onnx \
    BOT_PIPER_LIBRARY_PATH=/opt/piper:/opt/piper/piper-phonemize/lib:/usr/lib/x86_64-linux-gnu \
    LD_LIBRARY_PATH=/opt/piper:/opt/piper/piper-phonemize/lib:/usr/lib/x86_64-linux-gnu

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      dbus-x11 \
      espeak-ng \
      git \
      openssh-client \
      novnc \
      procps \
      ripgrep \
      supervisor \
      unzip \
      websockify \
      wget \
      x11vnc \
      xfce4 \
      xfce4-terminal \
      xvfb \
      xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash \
    && bun --version \
    && node --version

RUN bun install -g opencode-ai \
    && curl https://cursor.com/install -fsS | bash \
    && curl -Ls https://ngit.dev/install.sh | bash \
    && opencode --version \
    && agent --version \
    && ngit --version

RUN mkdir -p /opt/piper/voices \
    && curl -fsSL "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz" \
      | tar -xz -C /opt \
    && curl -fsSL \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/${PIPER_VOICE}.onnx" \
      -o "/opt/piper/voices/${PIPER_VOICE}.onnx" \
    && curl -fsSL \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/${PIPER_VOICE}.onnx.json" \
      -o "/opt/piper/voices/${PIPER_VOICE}.onnx.json" \
    && /opt/piper/piper --help >/dev/null

EXPOSE 1455 5551 5552 5900 6080

CMD ["bash", "-lc", "if [ \"${ENABLE_VNC:-0}\" = \"1\" ]; then Xvfb :99 -screen 0 1280x800x24 >/tmp/xvfb.log 2>&1 & xfce4-session >/tmp/xfce.log 2>&1 & x11vnc -display :99 -forever -shared -nopw -rfbport 5900 >/tmp/x11vnc.log 2>&1 & websockify --web=/usr/share/novnc/ 6080 localhost:5900 >/tmp/novnc.log 2>&1 & fi; bun install --frozen-lockfile && exec bun run start"]
