import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

import { spawn } from 'bun';

import { findExecutablePath } from '@src/executable';
import { log } from '@src/logger';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 20_000;
const PIPER_SERVICE_ORIGIN = 'http://127.0.0.1:5000';
const PIPER_SERVICE_POLL_MS = 250;

type NativePiperPaths = {
  binaryPath: string;
  modelPath: string;
  libraryPath: string;
};

type NativePiperCommand = {
  executable: string;
  prefixArgs: string[];
};

export type NativePiperStatus = NativePiperPaths & {
  binaryExists: boolean;
  modelExists: boolean;
  serviceEnabled: boolean;
};

type SynthesizeNativePiperProps = {
  dmBotRoot: string;
  text: string;
  lengthScale: number;
};

type SpawnNativePiperProps = NativePiperPaths & {
  text: string;
  lengthScale: number;
};

let piperServiceChild: ReturnType<typeof spawn> | null = null;
let piperServiceInitPromise: Promise<void> | null = null;
let piperServiceEndpoint: '/' | '/synthesize' | null = null;
let piperServiceUnavailable = false;

function resolveNativePiperPaths(dmBotRoot: string): NativePiperPaths {
  void dmBotRoot;

  return {
    binaryPath: process.env.BOT_PIPER_BINARY_PATH?.trim() ?? '',
    modelPath: expandHomePath(process.env.BOT_PIPER_MODEL_PATH?.trim() ?? ''),
    libraryPath: expandHomePath(
      process.env.BOT_PIPER_LIBRARY_PATH?.trim() ?? '',
    ),
  };
}

function expandHomePath(value: string): string {
  return value.startsWith('~/') ? `${homedir()}/${value.slice(2)}` : value;
}

function resolveNativePiperCommand(
  binaryPath: string,
): NativePiperCommand | null {
  const expanded = expandHomePath(binaryPath);

  if (existsSync(expanded)) {
    return { executable: expanded, prefixArgs: [] };
  }

  const [command, ...prefixArgs] = expanded.split(/\s+/).filter(Boolean);
  const executable = command ? findExecutablePath(command) : null;

  return executable ? { executable, prefixArgs } : null;
}

function piperEnvironment(libraryPath: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(libraryPath.length > 0
      ? {
          DYLD_LIBRARY_PATH: libraryPath,
          LD_LIBRARY_PATH: libraryPath,
        }
      : {}),
  };
}

function resolvePiperServiceCommand(
  binaryPath: string,
): NativePiperCommand | null {
  const command = resolveNativePiperCommand(binaryPath);

  if (!command) {
    return null;
  }

  const prefixArgs = [...command.prefixArgs];

  const moduleIndex = prefixArgs.findIndex(
    (arg, index) => arg === 'piper' && prefixArgs[index - 1] === '-m',
  );

  if (moduleIndex === -1) {
    return null;
  }

  prefixArgs[moduleIndex] = 'piper.http_server';

  return { executable: command.executable, prefixArgs };
}

function isPiperServiceEnabled(): boolean {
  return process.env.BOT_PIPER_SERVICE_ENABLED === '1';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function piperServiceIsReady(): Promise<boolean> {
  try {
    const response = await fetch(`${PIPER_SERVICE_ORIGIN}/voices`, {
      signal: AbortSignal.timeout(1_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function initializePiperService(paths: NativePiperPaths): Promise<void> {
  if (await piperServiceIsReady()) {
    return;
  }

  const command = resolvePiperServiceCommand(paths.binaryPath);

  if (!command) {
    throw new Error('native_piper_service_unsupported_command');
  }

  const child = spawn(
    [
      command.executable,
      ...command.prefixArgs,
      '--host',
      '127.0.0.1',
      '--port',
      '5000',
      '--model',
      paths.modelPath,
    ],
    {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      env: piperEnvironment(paths.libraryPath),
    },
  );

  piperServiceChild = child;
  let exitCode: number | null = null;

  void child.exited.then((code) => {
    exitCode = code;

    if (piperServiceChild === child) {
      piperServiceChild = null;
      piperServiceInitPromise = null;
      piperServiceEndpoint = null;
    }
  });

  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await piperServiceIsReady()) {
      return;
    }

    if (exitCode !== null) {
      throw new Error(`native_piper_service_exited:${exitCode}`);
    }

    await sleep(PIPER_SERVICE_POLL_MS);
  }

  child.kill();
  throw new Error('native_piper_service_start_timeout');
}

export async function startNativePiperService(
  dmBotRoot: string,
): Promise<void> {
  if (!isPiperServiceEnabled() || piperServiceUnavailable) {
    return;
  }

  if (!piperServiceInitPromise) {
    const paths = resolveNativePiperPaths(dmBotRoot);
    assertNativePiperReady(paths);

    piperServiceInitPromise = initializePiperService(paths).catch((err) => {
      piperServiceUnavailable = true;
      piperServiceInitPromise = null;
      throw err;
    });
  }

  await piperServiceInitPromise;
}

export function disposeNativePiperService(): void {
  piperServiceChild?.kill();
  piperServiceChild = null;
  piperServiceInitPromise = null;
  piperServiceEndpoint = null;
}

export function getNativePiperStatus(dmBotRoot: string): NativePiperStatus {
  const paths = resolveNativePiperPaths(dmBotRoot);

  return {
    ...paths,
    binaryExists: resolveNativePiperCommand(paths.binaryPath) !== null,
    modelExists: paths.modelPath.length > 0 && existsSync(paths.modelPath),
    serviceEnabled: isPiperServiceEnabled(),
  };
}

function assertNativePiperReady(paths: NativePiperPaths): void {
  if (!resolveNativePiperCommand(paths.binaryPath)) {
    throw new Error(`native_piper_binary_missing:${paths.binaryPath}`);
  }

  if (!existsSync(paths.modelPath)) {
    throw new Error(`native_piper_model_missing:${paths.modelPath}`);
  }
}

async function spawnNativePiper(props: SpawnNativePiperProps): Promise<Blob> {
  const command = resolveNativePiperCommand(props.binaryPath);

  if (!command) {
    throw new Error(`native_piper_binary_missing:${props.binaryPath}`);
  }

  const outputDir = mkdtempSync(join(tmpdir(), 'appweaver-piper-'));
  const outputPath = join(outputDir, 'speech.wav');

  try {
    const proc = spawn(
      [
        command.executable,
        ...command.prefixArgs,
        '--model',
        props.modelPath,
        '--output_file',
        outputPath,
        '--length_scale',
        String(props.lengthScale),
      ],
      {
        stdin: 'pipe',
        stdout: 'ignore',
        stderr: 'pipe',
        env: piperEnvironment(props.libraryPath),
      },
    );

    proc.stdin.write(`${props.text}\n`);
    proc.stdin.end();

    let timeout: ReturnType<typeof setTimeout> | null = null;

    const exitCodePromise = Promise.race([
      proc.exited,
      new Promise<number>((resolve) => {
        timeout = setTimeout(() => {
          proc.kill();
          resolve(124);
        }, DEFAULT_TIMEOUT_MS);
      }),
    ]);

    const [exitCode, stderr] = await Promise.all([
      exitCodePromise,
      new Response(proc.stderr).text(),
    ]);

    if (timeout) {
      clearTimeout(timeout);
    }

    if (exitCode !== 0) {
      const detail = stderr.trim() || `exit_code_${exitCode}`;

      throw new Error(`native_piper_failed:${detail}`);
    }

    const audio = existsSync(outputPath) ? readFileSync(outputPath) : null;

    if (!audio || audio.byteLength === 0) {
      throw new Error('native_piper_empty_audio');
    }

    return new Blob([new Uint8Array(audio)], { type: 'audio/wav' });
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

async function synthesizeWithPiperService({
  text,
  lengthScale,
}: {
  text: string;
  lengthScale: number;
}): Promise<Blob> {
  const endpoints: Array<'/' | '/synthesize'> = piperServiceEndpoint
    ? [piperServiceEndpoint]
    : ['/synthesize', '/'];

  for (const endpoint of endpoints) {
    const response = await fetch(`${PIPER_SERVICE_ORIGIN}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, length_scale: lengthScale }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (
      !piperServiceEndpoint &&
      (response.status === 404 || response.status === 405)
    ) {
      continue;
    }

    if (!response.ok) {
      throw new Error(`native_piper_service_failed:${response.status}`);
    }

    const audio = await response.arrayBuffer();

    if (audio.byteLength === 0) {
      throw new Error('native_piper_empty_audio');
    }

    piperServiceEndpoint = endpoint;

    return new Blob([audio], { type: 'audio/wav' });
  }

  throw new Error('native_piper_service_endpoint_missing');
}

export async function synthesizeNativePiper(
  props: SynthesizeNativePiperProps,
): Promise<Blob> {
  const text = props.text.trim();

  if (text.length === 0) {
    throw new Error('invalid_tts_text');
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error('tts_text_too_long');
  }

  const paths = resolveNativePiperPaths(props.dmBotRoot);
  assertNativePiperReady(paths);

  if (isPiperServiceEnabled() && !piperServiceUnavailable) {
    try {
      await startNativePiperService(props.dmBotRoot);

      return await synthesizeWithPiperService({
        text,
        lengthScale: props.lengthScale,
      });
    } catch (err) {
      piperServiceUnavailable = true;
      disposeNativePiperService();

      log.warn(
        `Piper service unavailable, falling back to CLI: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return spawnNativePiper({
    ...paths,
    text,
    lengthScale: props.lengthScale,
  });
}
