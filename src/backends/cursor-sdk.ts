// ---------------------------------------------------------------------------
// backends/cursor-sdk.ts — Cursor Agent SDK backend via Node worker
// ---------------------------------------------------------------------------
import { join } from 'path';

import { spawn } from 'bun';

import { debug, log } from '../logger';

import {
  createStreamDebugMetrics,
  logStreamDebugSummary,
  recordStreamDebugChunk,
} from './stream-debug';
import type { AgentBackend, AgentRunResult, RunMessageProps } from './types';

const DEFAULT_CURSOR_SDK_MODEL = 'composer-2';
const WORKER_TIMEOUT_MS = 120_000;
const MODEL_CACHE_TTL_MS = 86_400_000;

type CursorSdkModelCacheEntry = {
  models: string[];
  ts: number;
};

const cursorSdkModelCache = new Map<string, CursorSdkModelCacheEntry>();
const cursorSdkModelCacheRequests = new Map<string, Promise<string[]>>();

export function listCachedCursorSdkModelCatalog(): Array<{
  value: string;
  label: string;
}> {
  const cacheKey = process.env.CURSOR_API_KEY ?? '';
  const cached = cursorSdkModelCache.get(cacheKey);

  if (!cached || Date.now() - cached.ts > MODEL_CACHE_TTL_MS) {
    return [];
  }

  return cached.models.map((model) => ({ value: model, label: model }));
}

type CursorSdkWorkerRequest =
  | {
      type: 'create';
      apiKey: string | undefined;
      cwd: string;
      model: string;
    }
  | {
      type: 'models';
      apiKey: string | undefined;
      cwd: string;
      model: string;
    }
  | {
      type: 'run';
      apiKey: string | undefined;
      cwd: string;
      model: string;
      sessionId: string;
      content: string;
    };

type CursorSdkWorkerResult =
  | { ok: true; sessionId: string }
  | { ok: true; output: string; model: string | null }
  | { ok: true; models: string[] }
  | { ok: false; error: string };

type CursorSdkWorkerOutput =
  | { type: 'text_delta'; text: string }
  | { type: 'result'; result: CursorSdkWorkerResult };

function parseWorkerOutputLine(line: string): CursorSdkWorkerOutput | null {
  try {
    const parsed = JSON.parse(line) as unknown;

    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed as CursorSdkWorkerOutput;
    }

    if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
      return { type: 'result', result: parsed as CursorSdkWorkerResult };
    }
  } catch {
    // Ignore non-JSON output from SDK internals.
  }

  return null;
}

function parseWorkerResult(stdout: string): CursorSdkWorkerResult {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseWorkerOutputLine(lines[index]!);

    if (parsed?.type === 'result') {
      return parsed.result;
    }
  }

  return {
    ok: false,
    error: stdout.trim() || 'Cursor SDK worker returned no output',
  };
}

async function runCursorSdkWorker(
  request: CursorSdkWorkerRequest,
): Promise<CursorSdkWorkerResult> {
  const workerPath = join(import.meta.dir, 'cursor-sdk-worker.mjs');

  const proc = spawn(['node', workerPath], {
    cwd: request.cwd,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });

  proc.stdin.write(JSON.stringify(request));
  proc.stdin.end();

  let timeout: ReturnType<typeof setTimeout> | null = null;

  const exitCode = await Promise.race([
    proc.exited,
    new Promise<number>((resolve) => {
      timeout = setTimeout(() => {
        proc.kill();
        resolve(124);
      }, WORKER_TIMEOUT_MS);
    }),
  ]);

  if (timeout) {
    clearTimeout(timeout);
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const result = parseWorkerResult(stdout);

  if (result.ok === false && stderr.trim()) {
    debug('cursor-sdk worker stderr', stderr.trim());
  }

  if (exitCode === 124) {
    return {
      ok: false,
      error: `Cursor SDK worker timed out after ${WORKER_TIMEOUT_MS}ms`,
    };
  }

  return result;
}

function processWorkerOutputLine(props: {
  line: string;
  onTextDelta: (text: string) => void;
  setResult: (result: CursorSdkWorkerResult) => void;
}): void {
  const parsed = parseWorkerOutputLine(props.line.trim());

  if (!parsed) {
    return;
  }

  if (parsed.type === 'text_delta') {
    props.onTextDelta(parsed.text);

    return;
  }

  props.setResult(parsed.result);
}

async function consumeWorkerStdout(props: {
  stdout: ReadableStream<Uint8Array>;
  onTextDelta: (text: string) => void;
  setResult: (result: CursorSdkWorkerResult) => void;
}): Promise<void> {
  const reader = props.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newlineIndex = buffer.indexOf('\n');

      if (newlineIndex === -1) {
        break;
      }

      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      processWorkerOutputLine({
        line,
        onTextDelta: props.onTextDelta,
        setResult: props.setResult,
      });
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    processWorkerOutputLine({
      line: buffer,
      onTextDelta: props.onTextDelta,
      setResult: props.setResult,
    });
  }
}

async function runCursorSdkWorkerStreaming(props: {
  request: Extract<CursorSdkWorkerRequest, { type: 'run' }>;
  onTextDelta: (text: string) => void;
  abortSignal: AbortSignal | null;
}): Promise<CursorSdkWorkerResult> {
  const workerPath = join(import.meta.dir, 'cursor-sdk-worker.mjs');

  const proc = spawn(['node', workerPath], {
    cwd: props.request.cwd,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });

  proc.stdin.write(JSON.stringify(props.request));
  proc.stdin.end();

  let result: CursorSdkWorkerResult | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const kill = (): void => {
    proc.kill();
  };

  props.abortSignal?.addEventListener('abort', kill, { once: true });

  const consumeStdout = consumeWorkerStdout({
    stdout: proc.stdout,
    onTextDelta: props.onTextDelta,
    setResult: (nextResult) => {
      result = nextResult;
    },
  });

  const exitCode = await Promise.race([
    proc.exited,
    new Promise<number>((resolve) => {
      timeout = setTimeout(() => {
        proc.kill();
        resolve(124);
      }, WORKER_TIMEOUT_MS);
    }),
  ]);

  if (timeout) {
    clearTimeout(timeout);
  }

  props.abortSignal?.removeEventListener('abort', kill);

  await consumeStdout.catch((err) => {
    debug('cursor-sdk worker stdout consumer failed', String(err));
  });

  const stderr = await new Response(proc.stderr).text();

  if (stderr.trim()) {
    debug('cursor-sdk worker stderr', stderr.trim());
  }

  if (props.abortSignal?.aborted) {
    return { ok: false, error: 'Request aborted' };
  }

  if (exitCode === 124) {
    return {
      ok: false,
      error: `Cursor SDK worker timed out after ${WORKER_TIMEOUT_MS}ms`,
    };
  }

  return result ?? { ok: false, error: 'Cursor SDK worker returned no result' };
}

async function listCursorSdkModelsCached(model: string): Promise<string[]> {
  const cacheKey = process.env.CURSOR_API_KEY ?? '';
  const cached = cursorSdkModelCache.get(cacheKey);

  if (cached && Date.now() - cached.ts <= MODEL_CACHE_TTL_MS) {
    return [...cached.models];
  }

  const pending = cursorSdkModelCacheRequests.get(cacheKey);

  if (pending) {
    return [...(await pending)];
  }

  const request = runCursorSdkWorker({
    type: 'models',
    apiKey: process.env.CURSOR_API_KEY,
    cwd: process.cwd(),
    model,
  }).then((result) => {
    if (!result.ok) {
      log.warn(`cursor-sdk: failed to list models: ${result.error}`);

      return [];
    }

    if (!('models' in result)) {
      log.warn('cursor-sdk: model worker did not return models');

      return [];
    }

    const models = [...result.models].sort();
    cursorSdkModelCache.set(cacheKey, { models, ts: Date.now() });

    return models;
  });

  cursorSdkModelCacheRequests.set(cacheKey, request);

  try {
    return [...(await request)];
  } finally {
    cursorSdkModelCacheRequests.delete(cacheKey);
  }
}

export function createCursorSdkBackend(
  modelOverride?: string | null,
): AgentBackend {
  const effectiveModel = modelOverride?.trim() || DEFAULT_CURSOR_SDK_MODEL;

  return {
    name: 'cursor',
    modelName: effectiveModel,

    async createSession(cwd: string): Promise<string> {
      log.info(`cursor-sdk: creating local agent via Node worker in ${cwd}`);

      const result = await runCursorSdkWorker({
        type: 'create',
        apiKey: process.env.CURSOR_API_KEY,
        cwd,
        model: effectiveModel,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      if (!('sessionId' in result)) {
        throw new Error('Cursor SDK worker did not return a session id');
      }

      log.info(`cursor-sdk: created agent ${result.sessionId}`);

      return result.sessionId;
    },

    async runMessage({
      sessionId,
      content,
      cwd,
      modelOverride,
      onAgentStreamChunk,
      streamAbortSignal,
    }: RunMessageProps): Promise<AgentRunResult> {
      const model = modelOverride?.trim() || effectiveModel;
      const streamMetrics = createStreamDebugMetrics('cursor', sessionId);

      const result = await runCursorSdkWorkerStreaming({
        request: {
          type: 'run',
          apiKey: process.env.CURSOR_API_KEY,
          cwd,
          model,
          sessionId,
          content,
        },
        onTextDelta: (text) => {
          recordStreamDebugChunk(streamMetrics, text);
          onAgentStreamChunk?.({ kind: 'text_delta', text });
        },
        abortSignal: streamAbortSignal,
      });

      logStreamDebugSummary(streamMetrics);

      if (!result.ok) {
        return {
          type: 'error',
          output: result.error,
          sessionId,
        };
      }

      if (!('output' in result)) {
        return {
          type: 'error',
          output: 'Cursor SDK worker did not return output',
          sessionId,
        };
      }

      return {
        type: 'success',
        outputs: [{ type: 'text', value: result.output }],
        sessionId,
        model: result.model ?? model,
      };
    },

    async availableModels(): Promise<string[]> {
      return listCursorSdkModelsCached(effectiveModel);
    },
  };
}
