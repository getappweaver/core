import { existsSync } from 'fs';

import { spawn } from 'bun';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 20_000;

type NativePiperPaths = {
  binaryPath: string;
  modelPath: string;
  libraryPath: string;
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
    modelPath: process.env.BOT_PIPER_MODEL_PATH?.trim() ?? '',
    libraryPath: process.env.BOT_PIPER_LIBRARY_PATH?.trim() ?? '',
  };
}

export function getNativePiperStatus(dmBotRoot: string): NativePiperStatus {
  const paths = resolveNativePiperPaths(dmBotRoot);

  return {
    ...paths,
    binaryExists: paths.binaryPath.length > 0 && existsSync(paths.binaryPath),
    modelExists: paths.modelPath.length > 0 && existsSync(paths.modelPath),
  };
}

function assertNativePiperReady(paths: NativePiperPaths): void {
  if (!existsSync(paths.binaryPath)) {
    throw new Error(`native_piper_binary_missing:${paths.binaryPath}`);
  }

  if (!existsSync(paths.modelPath)) {
    throw new Error(`native_piper_model_missing:${paths.modelPath}`);
  }
}

async function spawnNativePiper(props: SpawnNativePiperProps): Promise<Blob> {
  const proc = spawn(
    [
      props.binaryPath,
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
