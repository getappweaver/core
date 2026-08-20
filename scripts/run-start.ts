#!/usr/bin/env bun
/**
 * Production-ish start runner:
 * - builds `web/dist`
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

function shouldShowSetup(): boolean {
  return process.argv.slice(2).includes('--setup');
}

function isDemoMode(): boolean {
  return process.argv.slice(2).includes('--demo');
}

function isWebUiEnabled(): boolean {
  return (process.env.START_WEB_UI ?? '1') !== '0';
}

function readArgValue(name: string): string | null {
  const args = process.argv.slice(2);
  const inlinePrefix = `${name}=`;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith(inlinePrefix)) {
      return arg.slice(inlinePrefix.length).trim() || null;
    }

    if (arg === name) {
      const value = args[i + 1];

      if (!value || value.startsWith('--')) {
        return null;
      }

      return value.trim() || null;
    }
  }

  return null;
}

function resolveBindHost(): string {
  return (
    readArgValue('--host') || process.env.BOT_WEB_HOST?.trim() || '127.0.0.1'
  );
}

function botEnv(): NodeJS.ProcessEnv {
  const setupEnv = {
    BOT_SETUP_BILLBOARD: shouldShowSetup()
      ? '1'
      : process.env.BOT_SETUP_BILLBOARD,
    APPWEAVER_DEMO: isDemoMode() ? '1' : process.env.APPWEAVER_DEMO,
  };

  if (!isWebUiEnabled()) {
    return {
      ...process.env,
      ...setupEnv,
      BOT_WEB_HOST: resolveBindHost(),
      BOT_WEB_STATIC: '0',
    };
  }

  return {
    ...process.env,
    ...setupEnv,
    BOT_WEB_HOST: resolveBindHost(),
    BOT_WEB_STATIC: '1',
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
  console.log('[run-start] Running web build...');

  const result = spawnSync({
    cmd: ['bun', 'run', 'web:build'],
    cwd: DM_BOT_DIR,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      APPWEAVER_DEMO: isDemoMode() ? '1' : process.env.APPWEAVER_DEMO,
    },
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
