#!/usr/bin/env bun
/**
 * Production-ish start runner:
 * - starts bot API server (`src/index.ts`) on 5551
 * - ensures `web/dist` exists (builds if needed)
 * - serves web UI on 5552 via Vite preview
 */

import { join } from 'path';

import { spawn, spawnSync } from 'bun';

import { isWebDistUsable } from '../src/web/web-dist';

const DM_BOT_DIR = join(import.meta.dir, '..');
const INDEX_TS = join(DM_BOT_DIR, 'src', 'index.ts');

let botChild: ReturnType<typeof spawn> | null = null;
let webChild: ReturnType<typeof spawn> | null = null;
let shuttingDown = false;

function isWebUiEnabled(): boolean {
  return (process.env.START_WEB_UI ?? '1') !== '0';
}

function resolveWebPreviewHost(): string {
  return process.env.BOT_WEB_HOST?.trim() || '127.0.0.1';
}

function resolveWebPreviewPort(): string {
  return process.env.BOT_WEB_UI_PORT?.trim() || '5552';
}

function runBot(): ReturnType<typeof spawn> {
  return spawn({
    cmd: ['bun', 'run', INDEX_TS],
    cwd: DM_BOT_DIR,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  });
}

function runWebPreview(): ReturnType<typeof spawn> {
  return spawn({
    cmd: [
      'bunx',
      'vite',
      'preview',
      '--config',
      'web/vite.config.ts',
      '--host',
      resolveWebPreviewHost(),
      '--port',
      resolveWebPreviewPort(),
      '--strictPort',
    ],
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
      target.write(line.length === 0 ? '\n' : `${prefix} ${line}\n`);
    }
  }

  buffered += decoder.decode();

  if (buffered.length > 0) {
    target.write(`${prefix} ${buffered}\n`);
  }
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

  try {
    webChild?.kill();
  } catch {
    // Ignore if already exited.
  }
}

function exitOnChildFailure(code: number | null, which: 'bot' | 'web'): void {
  if (shuttingDown) {
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

  console.error(`[run-start] ${which} exited with code ${normalizedCode}.`);
  shutdownAll();
  process.exit(normalizedCode);
}

function main(): void {
  botChild = runBot();
  botChild.exited.then((code) => exitOnChildFailure(code, 'bot'));

  if (!isWebUiEnabled()) {
    console.log('[run-start] START_WEB_UI=0, skipping UI preview.');

    return;
  }

  ensureWebDistBuilt();

  console.log(
    `[run-start] Starting web preview at http://${resolveWebPreviewHost()}:${resolveWebPreviewPort()}/`,
  );

  webChild = runWebPreview();

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

  webChild.exited.then((code) => exitOnChildFailure(code, 'web'));
}

process.on('SIGINT', () => {
  shutdownAll();

  process.exit(130);
});

process.on('SIGTERM', () => {
  shutdownAll();

  process.exit(143);
});

main();
