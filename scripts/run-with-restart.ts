#!/usr/bin/env bun
/**
 * Runs the bot and optional Vite web UI. Restarts the bot **only** when
 * `restart.requested` is created/touched — not on arbitrary file saves.
 * Use this when you want explicit restarts (e.g. agent touches the file after edits).
 */

import { existsSync, unlinkSync, watch } from 'fs';
import { join } from 'path';

import { spawn } from 'bun';

// parent of scripts is the root of the bot
const DM_BOT_DIR = join(import.meta.dir, '..');
const RESTART_FILE = join(DM_BOT_DIR, 'restart.requested');
const INDEX_TS = join(DM_BOT_DIR, 'src', 'index.ts');

const RAPID_CRASH_WINDOW_MS = 5_000;
const MAX_RAPID_CRASHES = 5;
const WEB_UI_BACKEND_WAIT_TIMEOUT_MS = 15_000;
const WEB_UI_BACKEND_POLL_MS = 250;

let botChild: ReturnType<typeof spawn>;
let webChild: ReturnType<typeof spawn> | null = null;
let restartRequested = false;
let rapidCrashCount = 0;
let lastStartTime = 0;

function shouldShowSetup(): boolean {
  return process.argv.slice(2).includes('--setup');
}

function isWebUiEnabled(): boolean {
  return (process.env.WATCH_WEB_UI ?? '1') !== '0';
}

function resolveWebUiHost(): string {
  const host = process.env.BOT_WEB_HOST?.trim() || '127.0.0.1';

  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

function resolveWebUiPort(): string {
  return process.env.BOT_WEB_UI_PORT?.trim() || '5552';
}

function resolveBotWebHost(): string {
  const host = process.env.BOT_WEB_HOST?.trim() || '127.0.0.1';

  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

function resolveBotWebPort(): string {
  return process.env.BOT_WEB_PORT?.trim() || '5551';
}

function botWebHealthUrl(): string {
  return `http://${resolveBotWebHost()}:${resolveBotWebPort()}/api/health`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WaitForHttpReadyProps = {
  url: string;
  timeoutMs: number;
  pollMs: number;
};

async function waitForHttpReady({
  url,
  timeoutMs,
  pollMs,
}: WaitForHttpReadyProps): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);

      if (res.ok) {
        return true;
      }
    } catch {
      // The bot process may still be booting.
    }

    await sleep(pollMs);
  }

  return false;
}

function botEnv(): NodeJS.ProcessEnv {
  const setupEnv = {
    BOT_SETUP_BILLBOARD: shouldShowSetup()
      ? '1'
      : process.env.BOT_SETUP_BILLBOARD,
  };

  if (!isWebUiEnabled()) {
    return {
      ...process.env,
      ...setupEnv,
      BOT_WEB_STATIC: '0',
    };
  }

  return {
    ...process.env,
    ...setupEnv,
    BOT_SETUP_UI_ORIGIN: `http://${resolveWebUiHost()}:${resolveWebUiPort()}`,
    BOT_WEB_STATIC: '0',
  };
}

function runBot(): ReturnType<typeof spawn> {
  return spawn({
    cmd: ['bun', 'run', INDEX_TS],
    cwd: DM_BOT_DIR,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env: botEnv(),
  });
}

function runWebUi(): ReturnType<typeof spawn> {
  return spawn({
    cmd: ['bun', 'run', 'web:dev'],
    cwd: DM_BOT_DIR,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });
}

async function forwardStreamWithPrefix(props: {
  stream: ReadableStream<Uint8Array> | number | null | undefined;
  prefix: string;
  target: NodeJS.WriteStream;
}): Promise<void> {
  const { stream, prefix, target } = props;

  if (!stream || typeof stream === 'number') {
    return;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';

    for (const line of lines) {
      if (line.length === 0) {
        target.write('\n');
      } else {
        target.write(`${prefix} ${line}\n`);
      }
    }
  }

  buffered += decoder.decode();

  if (buffered.length > 0) {
    target.write(`${prefix} ${buffered}\n`);
  }
}

function ensureWebUi(): void {
  if (!isWebUiEnabled() || webChild) {
    return;
  }

  console.log('[run-with-restart] Starting web UI dev server...');
  webChild = runWebUi();

  void forwardStreamWithPrefix({
    stream: webChild.stdout,
    prefix: '[web]',
    target: process.stdout,
  });

  void forwardStreamWithPrefix({
    stream: webChild.stderr,
    prefix: '[web]',
    target: process.stderr,
  });

  webChild.exited.then((code) => {
    webChild = null;

    if (code === 0 || code === null || code === 130) {
      return;
    }

    console.error(
      `[run-with-restart] Web UI exited with code ${code}, respawning...`,
    );

    ensureWebUi();
  });
}

async function ensureWebUiAfterBotReady(): Promise<void> {
  if (!isWebUiEnabled() || webChild) {
    return;
  }

  const url = botWebHealthUrl();
  console.log(`[run-with-restart] Waiting for bot web server at ${url}...`);

  const ready = await waitForHttpReady({
    url,
    timeoutMs: WEB_UI_BACKEND_WAIT_TIMEOUT_MS,
    pollMs: WEB_UI_BACKEND_POLL_MS,
  });

  if (!ready) {
    console.error(
      `[run-with-restart] Bot web server did not respond within ${WEB_UI_BACKEND_WAIT_TIMEOUT_MS}ms; starting web UI anyway.`,
    );
  }

  ensureWebUi();
}

function start(): void {
  lastStartTime = Date.now();
  botChild = runBot();

  botChild.exited.then((code) => {
    if (restartRequested) {
      restartRequested = false;
      rapidCrashCount = 0;
      console.log('\n[run-with-restart] Restarting bot...\n');
      start();

      return;
    }

    if (code === 0 || code === null || code === 130) {
      return;
    }

    const uptime = Date.now() - lastStartTime;

    if (uptime < RAPID_CRASH_WINDOW_MS) {
      rapidCrashCount++;

      if (rapidCrashCount >= MAX_RAPID_CRASHES) {
        console.error(
          `[run-with-restart] ${MAX_RAPID_CRASHES} rapid crashes in a row. Stopping.`,
        );

        process.exit(1);
      }

      const delayMs = 1000 * rapidCrashCount;

      console.error(
        `[run-with-restart] Bot exited with code ${code}. Rapid crash #${rapidCrashCount}, waiting ${delayMs}ms...`,
      );

      setTimeout(() => start(), delayMs);

      return;
    }

    rapidCrashCount = 0;

    console.error(
      `[run-with-restart] Bot exited with code ${code}, respawning...`,
    );

    start();
  });
}

start();
void ensureWebUiAfterBotReady();

function shutdownAll(): void {
  try {
    botChild.kill();
  } catch {
    // Ignore if already exited.
  }

  if (webChild) {
    try {
      webChild.kill();
    } catch {
      // Ignore if already exited.
    }
  }
}

process.on('SIGINT', () => {
  shutdownAll();
  process.exit(130);
});

process.on('SIGTERM', () => {
  shutdownAll();
  process.exit(143);
});

watch(DM_BOT_DIR, (_, filename) => {
  if (filename === 'restart.requested' && existsSync(RESTART_FILE)) {
    restartRequested = true;
    try {
      unlinkSync(RESTART_FILE);
    } catch {
      // Ignore if file was already removed.
    }

    botChild.kill();
  }
});
