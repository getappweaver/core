// ---------------------------------------------------------------------------
// backends/opencode-sdk.ts — OpenCode via @opencode-ai/sdk (in-process server)
// ---------------------------------------------------------------------------
import { createOpencode } from '@opencode-ai/sdk/v2';

import type { AgentMode } from '../db';
import { debug, log } from '../logger';
import type { ProviderName } from '../providers/types';

import {
  createOpencodeStreamLogState,
  mapOpencodeSsePayloadToChunk,
} from './agent-stream-chunk';
import type { ParseModelProps } from './opencode-common';
import {
  normalizeModelForProvider,
  readModelFromOpencodeConfig,
} from './opencode-common';
import type {
  AgentBackend,
  AgentErrorResult,
  AgentRunResult,
  AgentSuccessResult,
  OutputSegment,
  RunMessageProps,
} from './types';

type SdkInstance = Awaited<ReturnType<typeof createOpencode>>;

let sdk: SdkInstance | null = null;

const DEFAULT_PORTS = [4096, 4097, 4098, 4099];

function getPortsToTry(): number[] {
  const envPort = process.env.OPENCODE_SDK_PORT;

  if (envPort !== undefined && envPort !== '') {
    const n = parseInt(envPort, 10);

    if (Number.isNaN(n) || n < 1 || n > 65535) {
      log.warn(
        `opencode-sdk: invalid OPENCODE_SDK_PORT "${envPort}", using default ports`,
      );

      return DEFAULT_PORTS;
    }

    return [n];
  }

  return DEFAULT_PORTS;
}

async function getOrInitSdk(): Promise<SdkInstance> {
  if (sdk) {
    return sdk;
  }

  const ports = getPortsToTry();
  let lastError: Error | null = null;

  for (const port of ports) {
    try {
      sdk = await createOpencode({ port, hostname: '127.0.0.1' });
      debug(`opencode-sdk: server started on port ${port}`);

      return sdk;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (port === ports[ports.length - 1]) {
        break;
      }

      debug(
        `opencode-sdk: port ${port} failed, trying next: ${lastError.message}`,
      );
    }
  }

  const hint =
    ports.length === 1
      ? `Port ${ports[0]} may be in use. Set OPENCODE_SDK_PORT to another port, or stop any running "opencode serve".`
      : `Ports ${ports.join(', ')} failed. Set OPENCODE_SDK_PORT to a free port, or stop any running "opencode serve".`;

  throw new Error(
    `OpenCode SDK server failed to start: ${lastError?.message ?? 'unknown'}.\n${hint}`,
  );
}

export function disposeOpencodeSdk(): void {
  if (!sdk) {
    return;
  }

  try {
    sdk.server.close();
  } finally {
    sdk = null;
  }
}

function parseModel({
  dmBotRoot,
  mode,
  modelOverride,
  providerName,
}: ParseModelProps): string {
  const fromConfig = readModelFromOpencodeConfig(dmBotRoot, mode);
  let modelName = modelOverride ?? fromConfig;

  if (modelOverride) {
    debug(`opencode-sdk: using model override: ${modelOverride}`);
  }

  modelName = normalizeModelForProvider(modelName, providerName) ?? modelName;

  if (providerName === 'local' && modelName.startsWith('routstr/')) {
    log.warn(
      `provider is local but resolved model "${modelName}" has routstr/ prefix — this will likely fail`,
    );
  }

  return modelName;
}

function modelToProviderAndId(modelStr: string): {
  providerID: string;
  modelID: string;
} {
  const slash = modelStr.indexOf('/');

  if (slash === -1) {
    return { providerID: 'opencode', modelID: modelStr };
  }

  return {
    providerID: modelStr.slice(0, slash),
    modelID: modelStr.slice(slash + 1),
  };
}

type ParsePromptSdkResultProps = {
  result: {
    error?: unknown;
    data?: unknown;
    response?: Response;
  };
  sessionId: string;
  effectiveModel: string;
};

function partsFromV2PromptData(data: {
  parts?: Array<{ type?: string; text?: string; content?: string } | string>;
  output?: string;
  content?: string;
  text?: string;
  info?: {
    cost?: number;
    tokens?: { input: number; output: number };
    structured_output?: unknown;
  };
}): OutputSegment[] {
  const parts = data.parts ?? [];
  const outputs: OutputSegment[] = [];

  if (parts.length > 0) {
    for (const p of parts) {
      const partType =
        p &&
        typeof p === 'object' &&
        typeof (p as { type?: string }).type === 'string'
          ? (p as { type: string }).type
          : '';

      const text =
        p &&
        typeof p === 'object' &&
        typeof (p as { text?: string }).text === 'string'
          ? (p as { text: string }).text
          : p &&
              typeof p === 'object' &&
              typeof (p as { content?: string }).content === 'string'
            ? (p as { content: string }).content
            : typeof p === 'string'
              ? p
              : '';

      if (text.length === 0) {
        continue;
      }

      if (partType === 'reasoning' || partType === 'thinking') {
        outputs.push({ type: 'reasoning', value: text });
      } else {
        outputs.push({ type: 'text', value: text });
      }
    }
  }

  if (outputs.length === 0) {
    const fallback =
      (typeof data.output === 'string' &&
        data.output.length > 0 &&
        data.output) ||
      (typeof data.content === 'string' &&
        data.content.length > 0 &&
        data.content) ||
      (typeof data.text === 'string' && data.text.length > 0 && data.text) ||
      (data.info?.structured_output != null
        ? typeof data.info.structured_output === 'string'
          ? data.info.structured_output
          : JSON.stringify(data.info.structured_output)
        : null);

    if (fallback) {
      outputs.push({ type: 'text', value: fallback });
    } else {
      outputs.push({ type: 'text', value: '(no output)' });
    }
  }

  return outputs;
}

function parsePromptSdkResult({
  result,
  sessionId,
  effectiveModel,
}: ParsePromptSdkResultProps): AgentRunResult {
  const res = result.response as Response | undefined;

  if (res) {
    debug('opencode-sdk session.prompt response', {
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers?.get?.('content-type') ?? null,
      ok: res.ok,
    });
  }

  if (result.error) {
    const err = result.error as
      | { data?: { message?: string }; statusCode?: number }
      | undefined;

    debug('opencode-sdk prompt error:', {
      statusCode: err?.statusCode,
      data: err?.data,
      raw: result.error,
    });

    const output = err?.data?.message ?? String(result.error);
    const statusCode = err?.statusCode;

    return {
      type: 'error',
      output,
      sessionId,
      statusCode,
    } satisfies AgentErrorResult;
  }

  const rawData = result.data as Record<string, unknown> | undefined;

  const data = (
    rawData && typeof rawData.data === 'object' && rawData.data !== null
      ? (rawData.data as Record<string, unknown>)
      : rawData
  ) as
    | {
        info?: {
          cost?: number;
          tokens?: { input: number; output: number };
          structured_output?: unknown;
        };
        parts?: Array<
          { type?: string; text?: string; content?: string } | string
        >;
        output?: string;
        content?: string;
        text?: string;
      }
    | undefined;

  if (!data) {
    debug(
      'opencode-sdk prompt: result.data missing, raw result:',
      JSON.stringify(result),
    );

    return {
      type: 'success',
      outputs: [{ type: 'text', value: '(no output)' }],
      sessionId,
      model: effectiveModel,
    };
  }

  const outputs = partsFromV2PromptData(data);

  if (outputs.length === 1 && outputs[0].type === 'text') {
    const only = outputs[0].value;

    if (only === '(no output)') {
      debug('opencode-sdk prompt: no text in parts', {
        responseStatus: res?.status ?? null,
        partsLength: data.parts?.length ?? 0,
        parts: data.parts,
        info: data.info,
        dataKeys: Object.keys(data),
        dataSample: JSON.stringify(data).slice(0, 500),
      });
    }
  }

  const info = data.info;

  const tokens = info?.tokens
    ? {
        input: info.tokens.input ?? 0,
        output: info.tokens.output ?? 0,
        total: (info.tokens.input ?? 0) + (info.tokens.output ?? 0),
      }
    : undefined;

  const cost = info?.cost;

  return {
    type: 'success',
    outputs,
    sessionId,
    model: effectiveModel,
    tokens,
    cost,
  } satisfies AgentSuccessResult;
}

type CreateOpencodeSDKBackendProps = {
  dmBotRoot: string;
  mode: AgentMode;
  modelOverride: string | null | undefined;
  providerName: ProviderName | null;
};

export function createOpencodeSDKBackend({
  dmBotRoot,
  mode,
  modelOverride,
  providerName,
}: CreateOpencodeSDKBackendProps): AgentBackend {
  const modelName = parseModel({
    dmBotRoot,
    mode,
    modelOverride,
    providerName,
  });

  return {
    name: 'opencode-sdk',
    modelName,

    async createSession(cwd: string): Promise<string> {
      const { client } = await getOrInitSdk();

      const result = await client.session.create({
        directory: cwd,
      });

      if (result.error) {
        const msg =
          typeof result.error === 'object' &&
          result.error !== null &&
          'data' in result.error
            ? String(
                (result.error as { data?: { message?: string } }).data
                  ?.message ?? result.error,
              )
            : String(result.error);

        throw new Error(`opencode-sdk session create failed: ${msg}`);
      }

      const session = result.data as { id: string };

      if (!session?.id) {
        throw new Error(
          'opencode-sdk session create: no session id in response',
        );
      }

      return session.id;
    },

    async runMessage(props: RunMessageProps): Promise<AgentRunResult> {
      const {
        sessionId,
        content,
        mode,
        cwd,
        modelOverride,
        onAgentStreamChunk,
        streamAbortSignal,
      } = props;

      const { client } = await getOrInitSdk();

      const normalizedOverride = normalizeModelForProvider(
        modelOverride,
        providerName,
      );

      const effectiveModel = normalizedOverride ?? modelName;
      const model = modelToProviderAndId(effectiveModel);

      if (modelOverride) {
        debug(
          `opencode-sdk: runMessage using model override: ${modelOverride}`,
        );
      }

      const promptParams = {
        sessionID: sessionId,
        directory: cwd,
        parts: [{ type: 'text' as const, text: content }],
        model,
        agent: mode,
      };

      debug(
        'opencode-sdk session.prompt input',
        JSON.stringify(promptParams, null, 2),
      );

      const useEventStream =
        onAgentStreamChunk !== null && streamAbortSignal !== null;

      if (!useEventStream) {
        const result = await client.session.prompt(promptParams);

        debug(
          'opencode-sdk session.prompt result',
          JSON.stringify(result, null, 2),
        );

        return parsePromptSdkResult({
          result,
          sessionId,
          effectiveModel,
        });
      }

      if (streamAbortSignal.aborted) {
        return {
          type: 'error',
          output: 'Request aborted',
          sessionId,
        } satisfies AgentErrorResult;
      }

      const logState = createOpencodeStreamLogState(sessionId);

      const sse = await client.event.subscribe({
        directory: cwd,
      });

      const stream = sse.stream;
      let stopConsumer = false;

      const onExternalAbort = (): void => {
        stopConsumer = true;

        void client.session
          .abort({
            sessionID: sessionId,
            directory: cwd,
          })
          .catch((err) => {
            debug(
              'opencode-sdk stream: session.abort after external abort failed',
              String(err),
            );
          });

        void stream.return(undefined).catch((err) => {
          debug(
            'opencode-sdk stream: stream.return during external abort failed',
            String(err),
          );
        });
      };

      streamAbortSignal.addEventListener('abort', onExternalAbort, {
        once: true,
      });

      const pump = async (): Promise<void> => {
        try {
          for await (const evt of stream) {
            if (stopConsumer || streamAbortSignal.aborted) {
              break;
            }

            const chunk = mapOpencodeSsePayloadToChunk(
              evt,
              sessionId,
              logState,
            );

            if (chunk) {
              onAgentStreamChunk(chunk);
            }
          }
        } catch (err) {
          debug(`opencode-sdk stream consumer: ${String(err)}`);
        }
      };

      const pumpPromise = pump();

      let promptResult: Awaited<ReturnType<typeof client.session.prompt>>;

      try {
        promptResult = await client.session.prompt(promptParams);
      } finally {
        stopConsumer = true;
        streamAbortSignal.removeEventListener('abort', onExternalAbort);

        try {
          await stream.return(undefined);
        } catch (err) {
          debug(
            'opencode-sdk stream: stream.return in finally failed',
            String(err),
          );
        }

        await pumpPromise.catch((err) => {
          debug('opencode-sdk stream: pump promise rejected', String(err));
        });
      }

      debug(
        'opencode-sdk session.prompt result',
        JSON.stringify(promptResult, null, 2),
      );

      return parsePromptSdkResult({
        result: promptResult,
        sessionId,
        effectiveModel,
      });
    },

    async availableModels(): Promise<string[]> {
      const { client } = await getOrInitSdk();

      const result = await client.config.providers({});

      if (result.error || !result.data) {
        return [];
      }

      const data = result.data as {
        providers?: Array<{ id: string; models?: Record<string, unknown> }>;
      };

      const list: string[] = [];

      for (const provider of data.providers ?? []) {
        const providerId = provider.id ?? '';

        for (const modelId of Object.keys(provider.models ?? {})) {
          list.push(`${providerId}/${modelId}`);
        }
      }

      return list.sort();
    },
  };
}
