FROM mcr.microsoft.com/playwright:v1.59.1-noble

ARG DEBIAN_FRONTEND=noninteractive
ARG PIPER_VERSION=2023.11.14-2
ARG PIPER_VOICE=en_US-libritts_r-medium

ENV BUN_INSTALL=/home/pwuser/.bun \
    HOME=/home/pwuser \
    XDG_CONFIG_HOME=/workspace/.data/xdg/config \
    XDG_DATA_HOME=/workspace/.data/xdg/share \
    XDG_CACHE_HOME=/workspace/.data/xdg/cache \
    PATH=/home/pwuser/.bun/bin:/home/pwuser/.local/bin:/usr/local/bin:$PATH \
    APPWEAVER_REPO_URL=https://github.com/getappweaver/core.git \
    APPWEAVER_GIT_REF=main \
    DISPLAY=:99 \
    BOT_WEB_HOST=0.0.0.0 \
    BOT_WEB_UI_PORT=5552 \
    BOT_PIPER_BINARY_PATH=/opt/piper/piper \
    BOT_PIPER_MODEL_PATH=/opt/piper/voices/${PIPER_VOICE}.onnx \
    BOT_PIPER_LIBRARY_PATH=/opt/piper:/opt/piper/piper-phonemize/lib:/usr/lib/x86_64-linux-gnu \
    LD_LIBRARY_PATH=/opt/piper:/opt/piper/piper-phonemize/lib:/usr/lib/x86_64-linux-gnu

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

RUN mkdir -p /opt/piper/voices \
    && curl -fsSL "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz" \
      | tar -xz -C /opt \
    && curl -fsSL \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/${PIPER_VOICE}.onnx" \
      -o "/opt/piper/voices/${PIPER_VOICE}.onnx" \
    && curl -fsSL \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/${PIPER_VOICE}.onnx.json" \
      -o "/opt/piper/voices/${PIPER_VOICE}.onnx.json" \
    && /opt/piper/piper --help >/dev/null \
    && mkdir -p /workspace/appweaver /workspace/.data/xdg/config /workspace/.data/xdg/share /workspace/.data/xdg/cache \
    && chown -R pwuser:pwuser /workspace /home/pwuser

COPY scripts/docker-entrypoint.sh /usr/local/bin/appweaver-entrypoint
RUN chmod +x /usr/local/bin/appweaver-entrypoint

USER pwuser
WORKDIR /workspace/appweaver

RUN curl -fsSL https://bun.sh/install | bash \
    && bun --version \
    && node --version

RUN bun install -g opencode-ai \
    && curl https://cursor.com/install -fsS | bash \
    && curl -Ls https://ngit.dev/install.sh | bash \
    && opencode --version \
    && agent --version \
    && ngit --version

EXPOSE 1455 5551 5552 5900 6080

CMD ["appweaver-entrypoint"]
