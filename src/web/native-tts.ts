import { existsSync } from 'fs';
import { homedir } from 'os';

import { spawn } from 'bun';

import { findExecutablePath } from '@src/executable';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 20_000;

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

export function getNativePiperStatus(dmBotRoot: string): NativePiperStatus {
  const paths = resolveNativePiperPaths(dmBotRoot);

  return {
    ...paths,
    binaryExists: resolveNativePiperCommand(paths.binaryPath) !== null,
    modelExists: paths.modelPath.length > 0 && existsSync(paths.modelPath),
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

  const proc = spawn(
    [
      command.executable,
      ...command.prefixArgs,
      '--model',
      props.modelPath,
      '--output_file',
      '-',
      '--length_scale',
      String(props.lengthScale),
      '--quiet',
    ],
    {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        ...(props.libraryPath.length > 0
          ? {
              DYLD_LIBRARY_PATH: props.libraryPath,
              LD_LIBRARY_PATH: props.libraryPath,
            }
          : {}),
      },
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

  const [exitCode, audio, stderr] = await Promise.all([
    exitCodePromise,
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
  ]);

  if (timeout) {
    clearTimeout(timeout);
  }

  if (exitCode !== 0) {
    const detail = stderr.trim() || `exit_code_${exitCode}`;

    throw new Error(`native_piper_failed:${detail}`);
  }

  if (audio.byteLength === 0) {
    throw new Error('native_piper_empty_audio');
  }

  return new Blob([audio], { type: 'audio/wav' });
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

  return spawnNativePiper({
    ...paths,
    text,
    lengthScale: props.lengthScale,
  });
}
