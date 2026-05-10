#!/usr/bin/env bun
/**
 * Production-ish start runner:
 * - ensures `web/dist` exists (builds if needed)
 * - starts bot API server (`src/index.ts`) on 5551
 * - serves built web UI from the bot API server when START_WEB_UI is enabled
 */

import { existsSync, unlinkSync, watch } from 'fs';
import { join } from 'path';

import { spawn, spawnSync } from 'bun';

import { isWebDistUsable } from '../src/web/web-dist';

const DM_BOT_DIR = join(import.meta.dir, '..');
const INDEX_TS = join(DM_BOT_DIR, 'src', 'index.ts');
const RESTART_FILE = join(DM_BOT_DIR, 'restart.requested');

let botChild: ReturnType<typeof spawn> | null = null;
let shuttingDown = false;
let restartRequested = false;

function isWebUiEnabled(): boolean {
  return (process.env.START_WEB_UI ?? '1') !== '0';
}

function botEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BOT_WEB_STATIC: isWebUiEnabled() ? '1' : '0',
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

function ensureWebDistBuilt(): void {
  if (isWebDistUsable(DM_BOT_DIR)) {
    return;
  }

  console.log('[run-start] web/dist missing or stale. Running web build...');

  const result = spawnSync({
    cmd: ['bun', 'run', 'web:build'],
    cwd: DM_BOT_DIR,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  });

  if (result.exitCode !== 0 || !isWebDistUsable(DM_BOT_DIR)) {
    console.error('[run-start] Failed to prepare web/dist.');
    process.exit(result.exitCode ?? 1);
  }
}

function shutdownAll(): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  try {
    botChild?.kill();
  } catch {
    // Ignore if already exited.
  }
}

function startBot(): void {
  botChild = runBot();
  botChild.exited.then((code) => exitOnChild(code));
}

function exitOnChild(code: number | null): void {
  if (shuttingDown) {
    return;
  }

  if (restartRequested) {
    restartRequested = false;
    startBot();

    return;
  }

  const normalizedCode = code ?? 0;

  if (
    normalizedCode === 0 ||
    normalizedCode === 130 ||
    normalizedCode === 143
  ) {
    shutdownAll();
    process.exit(normalizedCode);
  }

  console.error(`[run-start] bot exited with code ${normalizedCode}.`);
  shutdownAll();
  process.exit(normalizedCode);
}

function main(): void {
  if (!isWebUiEnabled()) {
    console.log('[run-start] START_WEB_UI=0, backend static UI disabled.');
  } else {
    ensureWebDistBuilt();
  }

  startBot();
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

    botChild?.kill();
  }
});

main();
