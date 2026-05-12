import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// backends/opencode-sdk.ts — OpenCode via @opencode-ai/sdk (in-process server)
// ---------------------------------------------------------------------------
import { createOpencode } from '@opencode-ai/sdk/v2';

import { debug, log } from '../logger';
import type { ProviderName } from '../providers/types';

import {
  coerceFileDiff,
  createOpencodeStreamLogState,
  mapOpencodeSsePayloadToChunk,
  type AgentFileDiff,
} from './agent-stream-chunk';
import type { ParseModelProps } from './opencode-common';
import {
  normalizeModelForProvider,
  resolveConfiguredModelFromOpencodeConfig,
} from './opencode-common';
import { buildOpenCodeRuntimeContent } from './opencode-runtime-context';
import {
  createStreamDebugMetrics,
  logStreamDebugSummary,
  recordStreamDebugChunk,
} from './stream-debug';
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
let sdkInitPromise: Promise<SdkInstance> | null = null;

const DEFAULT_PORT_START = 4099;
const DEFAULT_PORT_COUNT = 12;

function buildPortRange(start: number, count: number): number[] {
  const ports: number[] = [];

  for (let port = start; port <= 65535 && ports.length < count; port += 1) {
    ports.push(port);
  }

  return ports;
}

const DEFAULT_PORTS = buildPortRange(DEFAULT_PORT_START, DEFAULT_PORT_COUNT);

export type OpencodeSdkContextStats = {
  tokensTotal: number;
  contextLimit: number | null;
  contextPercent: number | null;
};

export type OpencodeSetupAuthMethod = {
  type: string;
  label: string;
  prompts: unknown[];
};

export type OpencodeSetupProvider = {
  id: string;
  name: string;
  source: string;
  env: string[];
  configured: boolean;
  authMethods: OpencodeSetupAuthMethod[];
};

export type OpencodeSetupAuthStatus = {
  ok: true;
  providers: OpencodeSetupProvider[];
};

export type OpencodeSetupAuthorizeResult = {
  ok: true;
  providerID: string;
  methodIndex: number;
  url: string | null;
  method: string | null;
  instructions: string | null;
};

type StoredAuthJson = Record<string, unknown>;

type StartNativeOpenCodeAuthProps = {
  directory: string;
  providerID: string;
  methodLabel: string;
};

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

    if (process.env.OPENCODE_SDK_STRICT_PORT === '1') {
      return [n];
    }

    return [
      n,
      ...buildPortRange(n + 1, DEFAULT_PORT_COUNT - 1),
      ...DEFAULT_PORTS,
    ].filter((port, index, ports) => ports.indexOf(port) === index);
  }

  return DEFAULT_PORTS;
}

async function initSdk(): Promise<SdkInstance> {
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
      : `Ports ${ports.join(', ')} failed. Set OPENCODE_SDK_PORT to a free preferred port, set OPENCODE_SDK_STRICT_PORT=1 to disable fallback, or stop unused "opencode serve" processes.`;

  throw new Error(
    `OpenCode SDK server failed to start: ${lastError?.message ?? 'unknown'}.\n${hint}`,
  );
}

async function getOrInitSdk(): Promise<SdkInstance> {
  if (sdk) {
    return sdk;
  }

  if (sdkInitPromise) {
    return sdkInitPromise;
  }

  sdkInitPromise = initSdk();

  try {
    return await sdkInitPromise;
  } finally {
    sdkInitPromise = null;
  }
}

function coerceAuthMethods(value: unknown): OpencodeSetupAuthMethod[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const raw = entry as {
        type?: unknown;
        label?: unknown;
        prompts?: unknown;
      };

      if (typeof raw.type !== 'string' || typeof raw.label !== 'string') {
        return null;
      }

      return {
        type: raw.type,
        label: raw.label,
        prompts: Array.isArray(raw.prompts) ? raw.prompts : [],
      };
    })
    .filter((entry): entry is OpencodeSetupAuthMethod => entry !== null);
}

export function getOpenCodeAuthJsonPath(): string {
  const dataHome = process.env.XDG_DATA_HOME?.trim();

  return join(
    dataHome && dataHome.length > 0
      ? dataHome
      : join(homedir(), '.local', 'share'),
    'opencode',
    'auth.json',
  );
}

function readOpenCodeAuthJson(): StoredAuthJson {
  const path = getOpenCodeAuthJsonPath();

  if (!existsSync(path)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as StoredAuthJson)
      : {};
  } catch (err) {
    debug(
      `opencode-sdk: failed to read auth.json: ${err instanceof Error ? err.message : String(err)}`,
    );

    return {};
  }
}

function hasStoredOpenCodeCredential(providerID: string): boolean {
  const authEntry = readOpenCodeAuthJson()[providerID];

  if (authEntry === undefined || authEntry === null) {
    return false;
  }

  if (typeof authEntry === 'string') {
    return authEntry.trim().length > 0;
  }

  if (typeof authEntry !== 'object' || Array.isArray(authEntry)) {
    return false;
  }

  return Object.keys(authEntry).length > 0;
}

function hasProviderEnvCredential(env: string[]): boolean {
  return env.some((name) => (process.env[name]?.trim() ?? '').length > 0);
}

async function startNativeOpenCodeAuth({
  directory,
  providerID,
  methodLabel,
}: StartNativeOpenCodeAuthProps): Promise<{
  url: string | null;
  instructions: string | null;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      'opencode',
      ['auth', 'login', '--provider', providerID, '--method', methodLabel],
      { cwd: directory, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let output = '';
    let settled = false;

    function settle(value: {
      url: string | null;
      instructions: string | null;
    }): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      child.unref();
      resolve(value);
    }

    function scan(chunk: Buffer): void {
      output += chunk.toString('utf8');
      const match = output.match(/https?:\/\/\S+/);

      if (match) {
        settle({ url: match[0].replace(/[),.]+$/, ''), instructions: null });
      }
    }

    const timer = setTimeout(() => {
      settle({
        url: null,
        instructions:
          'OpenCode native auth login was started. Complete the provider flow in the browser or terminal, then refresh this status.',
      });
    }, 8000);

    child.stdout?.on('data', scan);
    child.stderr?.on('data', scan);

    child.on('error', (err) => {
      if (!settled) {
        clearTimeout(timer);
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (!settled) {
        clearTimeout(timer);
        reject(new Error(`opencode_auth_login_failed:${code ?? 'unknown'}`));
      }
    });
  });
}

export async function getOpencodeSetupAuthStatus(
  directory: string,
): Promise<OpencodeSetupAuthStatus> {
  const { client } = await getOrInitSdk();

  const [authResult, providersResult] = await Promise.all([
    client.provider.auth({ directory }),
    client.provider.list({ directory }),
  ]);

  const authData = (authResult.data ?? {}) as Record<string, unknown>;

  const providerData = providersResult.data as
    | {
        all?: Array<{
          id?: unknown;
          name?: unknown;
          source?: unknown;
          env?: unknown;
        }>;
      }
    | undefined;

  const providers = (providerData?.all ?? [])
    .map((provider) => {
      if (typeof provider.id !== 'string') {
        return null;
      }

      const env = Array.isArray(provider.env)
        ? provider.env.filter(
            (name): name is string => typeof name === 'string',
          )
        : [];

      return {
        id: provider.id,
        name: typeof provider.name === 'string' ? provider.name : provider.id,
        source:
          typeof provider.source === 'string' ? provider.source : 'unknown',
        env,
        configured:
          hasStoredOpenCodeCredential(provider.id) ||
          hasProviderEnvCredential(env),
        authMethods: coerceAuthMethods(authData[provider.id]),
      };
    })
    .filter((provider): provider is OpencodeSetupProvider => provider !== null)
    .filter(
      (provider) =>
        provider.authMethods.length > 0 ||
        provider.configured ||
        provider.env.length > 0,
    )
    .sort((a, b) => {
      if (a.id === 'opencode') {
        return -1;
      }

      if (b.id === 'opencode') {
        return 1;
      }

      return a.name.localeCompare(b.name);
    });

  return { ok: true, providers };
}

export async function authorizeOpencodeSetupProvider(props: {
  directory: string;
  providerID: string;
  methodIndex: number;
}): Promise<OpencodeSetupAuthorizeResult> {
  const { client } = await getOrInitSdk();

  const authResult = await client.provider.auth({ directory: props.directory });
  const authData = (authResult.data ?? {}) as Record<string, unknown>;

  const method = coerceAuthMethods(authData[props.providerID])[
    props.methodIndex
  ];

  if (!method || method.type === 'api') {
    throw new Error('opencode_authorize_failed:invalid_auth_method');
  }

  disposeOpencodeSdk();

  const nativeResult = await startNativeOpenCodeAuth({
    directory: props.directory,
    providerID: props.providerID,
    methodLabel: method.label,
  });

  return {
    ok: true,
    providerID: props.providerID,
    methodIndex: props.methodIndex,
    url: nativeResult.url,
    method: method.type,
    instructions: nativeResult.instructions,
  };
}

export function disposeOpencodeSdk(): void {
  if (!sdk) {
    return;
  }

  try {
    sdk.server.close();
  } finally {
    sdk = null;
    sdkInitPromise = null;
  }
}

function parseModel({
  dmBotRoot,
  agentName,
  modelOverride,
  providerName,
}: ParseModelProps): string {
  const configured = resolveConfiguredModelFromOpencodeConfig(
    dmBotRoot,
    agentName,
  );

  let modelName = modelOverride ?? configured.modelName;

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

function coerceTokenTotal(tokens: unknown): number | null {
  if (!tokens || typeof tokens !== 'object') {
    return null;
  }

  const t = tokens as {
    total?: unknown;
    input?: unknown;
    output?: unknown;
    reasoning?: unknown;
    cache?: { read?: unknown; write?: unknown };
  };

  if (typeof t.total === 'number' && Number.isFinite(t.total)) {
    return t.total;
  }

  const parts = [t.input, t.output, t.reasoning, t.cache?.read, t.cache?.write];
  let total = 0;
  let found = false;

  for (const part of parts) {
    if (typeof part === 'number' && Number.isFinite(part)) {
      total += part;
      found = true;
    }
  }

  return found ? total : null;
}

function getMessageCreatedAt(message: unknown): number {
  if (!message || typeof message !== 'object') {
    return 0;
  }

  const time = (message as { time?: { created?: unknown } }).time;

  return typeof time?.created === 'number' ? time.created : 0;
}

type GetOpencodeSdkContextStatsProps = {
  sessionId: string;
  cwd: string;
  effectiveModel: string;
};

export async function getOpencodeSdkContextStats({
  sessionId,
  cwd,
  effectiveModel,
}: GetOpencodeSdkContextStatsProps): Promise<OpencodeSdkContextStats | null> {
  const { client } = await getOrInitSdk();

  const messagesResult = await client.session.messages({
    sessionID: sessionId,
    directory: cwd,
    limit: 20,
  });

  if (messagesResult.error || !Array.isArray(messagesResult.data)) {
    return null;
  }

  const assistantMessages = messagesResult.data
    .map((entry) => (entry as { info?: unknown }).info)
    .filter(
      (info): info is { role: 'assistant'; tokens: unknown } =>
        !!info &&
        typeof info === 'object' &&
        (info as { role?: unknown }).role === 'assistant' &&
        'tokens' in info,
    )
    .sort((a, b) => getMessageCreatedAt(b) - getMessageCreatedAt(a));

  const latestTokens = assistantMessages.length
    ? coerceTokenTotal(assistantMessages[0].tokens)
    : null;

  if (latestTokens === null) {
    return null;
  }

  const model = modelToProviderAndId(effectiveModel);
  const providersResult = await client.config.providers({ directory: cwd });

  const providersData = providersResult.data as
    | { providers?: Array<{ id?: string; models?: Record<string, unknown> }> }
    | undefined;

  const provider = providersData?.providers?.find(
    (p) => p.id === model.providerID,
  );

  const configuredModel = provider?.models?.[model.modelID] as
    | { limit?: { context?: unknown } }
    | undefined;

  const rawContextLimit = configuredModel?.limit?.context;

  const contextLimit =
    typeof rawContextLimit === 'number' && Number.isFinite(rawContextLimit)
      ? rawContextLimit
      : null;

  return {
    tokensTotal: latestTokens,
    contextLimit,
    contextPercent:
      contextLimit && contextLimit > 0
        ? Math.min(100, (latestTokens / contextLimit) * 100)
        : null,
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

type PromptSdkResult = ParsePromptSdkResultProps['result'];

function unwrapPromptData(
  result: PromptSdkResult,
): Record<string, unknown> | null {
  const rawData = result.data as Record<string, unknown> | undefined;

  if (!rawData) {
    return null;
  }

  return rawData && typeof rawData.data === 'object' && rawData.data !== null
    ? (rawData.data as Record<string, unknown>)
    : rawData;
}

function getPromptUserMessageId(result: PromptSdkResult): string | null {
  const data = unwrapPromptData(result);
  const info = data?.info;

  if (!info || typeof info !== 'object') {
    return null;
  }

  const parentID = (info as { parentID?: unknown }).parentID;

  return typeof parentID === 'string' && parentID.length > 0 ? parentID : null;
}

function coerceDiffFiles(value: unknown): AgentFileDiff[] {
  return Array.isArray(value)
    ? value
        .map(coerceFileDiff)
        .filter((file): file is AgentFileDiff => file !== null)
    : [];
}

function getPatchPartMessageId(raw: unknown, sessionId: string): string | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const root = raw as Record<string, unknown>;

  const rec =
    root.payload && typeof root.payload === 'object'
      ? (root.payload as Record<string, unknown>)
      : root;

  if (rec.type !== 'message.part.updated') {
    return null;
  }

  const properties = rec.properties;

  if (!properties || typeof properties !== 'object') {
    return null;
  }

  const p = properties as Record<string, unknown>;

  if (p.sessionID !== sessionId) {
    return null;
  }

  const part = p.part;

  if (!part || typeof part !== 'object') {
    return null;
  }

  const patchPart = part as Record<string, unknown>;

  if (patchPart.type !== 'patch') {
    return null;
  }

  const messageId = patchPart.messageID;

  return typeof messageId === 'string' && messageId.length > 0
    ? messageId
    : null;
}

function getEventRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const root = raw as Record<string, unknown>;

  return root.payload && typeof root.payload === 'object'
    ? (root.payload as Record<string, unknown>)
    : root;
}

function isSessionCompletionEvent(raw: unknown, sessionId: string): boolean {
  const rec = getEventRecord(raw);

  if (!rec) {
    return false;
  }

  const properties = rec.properties;

  if (!properties || typeof properties !== 'object') {
    return false;
  }

  const p = properties as Record<string, unknown>;

  return rec.type === 'session.idle' && p.sessionID === sessionId;
}

function latestAssistantMessage(
  value: unknown,
): Record<string, unknown> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  let latest: Record<string, unknown> | null = null;
  let latestCreated = -1;

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const rec = item as Record<string, unknown>;
    const info = rec.info;

    if (!info || typeof info !== 'object') {
      continue;
    }

    const message = info as Record<string, unknown>;

    if (message.role !== 'assistant') {
      continue;
    }

    const time = message.time;

    const created =
      time && typeof time === 'object'
        ? (time as { created?: unknown }).created
        : null;

    const createdNumber = typeof created === 'number' ? created : 0;

    if (createdNumber >= latestCreated) {
      latest = rec;
      latestCreated = createdNumber;
    }
  }

  return latest;
}

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

  const data = unwrapPromptData(result) as
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
  agentName: string;
  modelOverride: string | null | undefined;
  providerName: ProviderName | null;
};

export function createOpencodeSDKBackend({
  dmBotRoot,
  agentName,
  modelOverride,
  providerName,
}: CreateOpencodeSDKBackendProps): AgentBackend {
  const modelName = parseModel({
    dmBotRoot,
    agentName,
    modelOverride,
    providerName,
  });

  return {
    name: 'opencode',
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
        opencodeAgentName,
        cwd,
        modelOverride,
        onAgentStreamChunk,
        streamAbortSignal,
      } = props;

      const selectedAgentName = opencodeAgentName ?? agentName;

      const runContent = buildOpenCodeRuntimeContent({
        backendName: 'opencode',
        agentName: selectedAgentName,
        dmBotRoot,
        cwd,
        content,
      });

      const { client } = await getOrInitSdk();

      const effectiveModel = parseModel({
        dmBotRoot: cwd,
        agentName: selectedAgentName,
        modelOverride,
        providerName,
      });

      const model = modelToProviderAndId(effectiveModel);

      if (modelOverride) {
        debug(
          `opencode-sdk: runMessage using model override: ${modelOverride}`,
        );
      }

      const promptParams = {
        sessionID: sessionId,
        directory: cwd,
        parts: [{ type: 'text' as const, text: runContent }],
        model,
        agent: selectedAgentName,
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
      const streamMetrics = createStreamDebugMetrics('opencode', sessionId);
      let diffEmitted = false;
      const patchDiffMessageIds = new Set<string>();
      let streamErrorMessage: string | null = null;
      let resolveStreamComplete: () => void = () => {};

      const streamComplete = new Promise<void>((resolve) => {
        resolveStreamComplete = resolve;
      });

      const fetchAndEmitDiff = (messageID: string | null, reason: string) => {
        void (async () => {
          debug('opencode-sdk stream: fetching diff', {
            sessionId,
            messageID,
            reason,
          });

          const diffResult = await client.session.diff({
            sessionID: sessionId,
            directory: cwd,
            messageID: messageID ?? undefined,
          });

          const files = diffResult.error
            ? []
            : coerceDiffFiles(diffResult.data);

          if (files.length > 0) {
            diffEmitted = true;
            recordStreamDebugChunk(streamMetrics, null);
            onAgentStreamChunk({ kind: 'diff', files });

            return;
          }

          debug('opencode-sdk stream: diff fetch returned no files', {
            sessionId,
            messageID,
            reason,
            error: diffResult.error,
          });
        })().catch((err) => {
          debug('opencode-sdk stream: diff fetch failed', {
            sessionId,
            messageID,
            reason,
            error: String(err),
          });
        });
      };

      const sse = await client.global.event();

      const stream = sse.stream;
      let stopConsumer = false;

      const onExternalAbort = (): void => {
        stopConsumer = true;
        resolveStreamComplete();

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

      const pollUntilSessionIdle = async (): Promise<void> => {
        while (!stopConsumer && !streamAbortSignal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const statusResult = await client.session.status({ directory: cwd });

          if (statusResult.error || !statusResult.data) {
            continue;
          }

          const status = (
            statusResult.data as Record<string, { type?: string }>
          )[sessionId];

          if (status?.type === 'idle') {
            resolveStreamComplete();

            return;
          }
        }
      };

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
              if (chunk.kind === 'diff') {
                diffEmitted = true;
              }

              if (chunk.kind === 'error') {
                streamErrorMessage = chunk.message;
                resolveStreamComplete();
              }

              recordStreamDebugChunk(
                streamMetrics,
                chunk.kind === 'text_delta' ? chunk.text : null,
              );

              onAgentStreamChunk(chunk);

              if (isSessionCompletionEvent(evt, sessionId)) {
                resolveStreamComplete();
              }

              continue;
            }

            const patchMessageId = getPatchPartMessageId(evt, sessionId);

            if (patchMessageId && !patchDiffMessageIds.has(patchMessageId)) {
              patchDiffMessageIds.add(patchMessageId);

              debug('opencode-sdk stream: patch part observed', {
                sessionId,
                patchMessageId,
              });

              fetchAndEmitDiff(null, 'patch-part');
            }
          }
        } catch (err) {
          debug(`opencode-sdk stream consumer: ${String(err)}`);
        }
      };

      const pumpPromise = pump();
      const pollPromise = pollUntilSessionIdle();

      let promptResult: Awaited<
        ReturnType<typeof client.session.prompt>
      > | null = null;

      try {
        const promptAsyncResult =
          await client.session.promptAsync(promptParams);

        if (promptAsyncResult.error) {
          return {
            type: 'error',
            output: String(promptAsyncResult.error),
            sessionId,
          } satisfies AgentErrorResult;
        }

        await streamComplete;

        if (streamErrorMessage) {
          return {
            type: 'error',
            output: streamErrorMessage,
            sessionId,
          } satisfies AgentErrorResult;
        }

        const messagesResult = await client.session.messages({
          sessionID: sessionId,
          directory: cwd,
          limit: 10,
        });

        const latest = messagesResult.error
          ? null
          : latestAssistantMessage(messagesResult.data);

        promptResult = {
          data: latest ?? undefined,
          error: messagesResult.error,
          response: messagesResult.response,
        } as Awaited<ReturnType<typeof client.session.prompt>>;
      } finally {
        stopConsumer = true;
        resolveStreamComplete();
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

        await pollPromise.catch((err) => {
          debug('opencode-sdk stream: status poll rejected', String(err));
        });

        logStreamDebugSummary(streamMetrics);
      }

      if (!promptResult) {
        return {
          type: 'success',
          outputs: [{ type: 'text', value: '(no output)' }],
          sessionId,
          model: effectiveModel,
        } satisfies AgentSuccessResult;
      }

      if (!diffEmitted) {
        fetchAndEmitDiff(
          getPromptUserMessageId(promptResult),
          'prompt-complete',
        );
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
