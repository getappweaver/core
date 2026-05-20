import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { nip19 } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { generateVAPIDKeys } from 'web-push';

import {
  AgentBackendNameSchema,
  AgentModeSchema,
  DmCommandPrefixSchema,
  LintingSchema,
  ProviderNameSchema,
  setAgentBackend,
  setDefaultMode,
  setDmCommandPrefix,
  setLinting,
  markSetupConfigured,
  setProviderName,
  setWorkspaceTarget,
  type CoreDb,
  type AgentBackendName,
  type AgentMode,
  type Linting,
  type ProviderName,
  type WorkspaceTarget,
  WorkspaceTargetSchema,
} from '@src/db';
import { normalizeVapidSubject, parseRelayUrls } from '@src/env';
import { setEnvInFile } from '@src/env-file';
import {
  ensureOpencodeParentWorkspaceAssets,
  type InstallParentWorkspaceAssetsResult,
} from '@src/workspace-assets';

type SetMasterPubkeyProps = {
  dmBotRoot: string;
  rawPubkey: string;
};

type SetMasterPubkeyResult = {
  masterPubkey: string;
};

type GenerateBotKeyProps = {
  dmBotRoot: string;
};

type GenerateBotKeyResult = {
  botPubkey: string;
};

type SetRelaysProps = {
  dmBotRoot: string;
  rawRelays: string[];
};

type SetRelaysResult = {
  relays: string[];
};

type SetCursorApiKeyProps = {
  dmBotRoot: string;
  apiKey: string;
};

type SetCursorApiKeyResult = {
  saved: true;
};

type SetProviderApiKeyProps = {
  dmBotRoot: string;
  values: Record<string, string>;
};

type SetProviderApiKeyResult = {
  envNames: string[];
  saved: true;
};

type SetupWebPushProps = {
  dmBotRoot: string;
  subjectRaw: string;
  generateNewKeys: boolean;
};

type SetupWebPushResult = {
  publicKey: string;
  subject: string;
};

type SetPiperConfigProps = {
  dmBotRoot: string;
  binaryPath: string;
  modelPath: string;
  libraryPath: string;
};

type SetPiperConfigResult = {
  binaryPath: string;
  modelPath: string;
  libraryPath: string;
};

type DownloadPiperModelProps = {
  dmBotRoot: string;
};

type DownloadPiperModelResult = {
  modelPath: string;
  configPath: string;
};

const DEFAULT_PIPER_MODEL_URL =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx';

const DEFAULT_PIPER_MODEL_CONFIG_URL = `${DEFAULT_PIPER_MODEL_URL}.json`;

export type SetupDefaultsInput = {
  prefix: string;
  backend: string;
  provider: string;
  mode: string;
  workspace: string;
  linting: string;
  readyNotification: boolean;
};

type SetSetupDefaultsProps = {
  db: CoreDb;
  dmBotRoot: string;
  parentOfBotRoot: string;
  input: SetupDefaultsInput;
};

type SetupDefaultsResult = {
  defaults: {
    prefix: string;
    backend: AgentBackendName;
    provider: ProviderName;
    mode: AgentMode;
    workspace: WorkspaceTarget;
    linting: Linting;
    readyNotification: boolean;
  };
  parentWorkspaceInstall: InstallParentWorkspaceAssetsResult | null;
};

function normalizeMasterPubkey(raw: string): string {
  const value = raw.trim();

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return value.toLowerCase();
  }

  if (value.startsWith('npub1')) {
    const decoded = nip19.decode(value);

    if (decoded.type === 'npub' && typeof decoded.data === 'string') {
      return decoded.data.toLowerCase();
    }
  }

  throw new Error('invalid_master_pubkey');
}

export function setSetupMasterPubkey({
  dmBotRoot,
  rawPubkey,
}: SetMasterPubkeyProps): SetMasterPubkeyResult {
  const masterPubkey = normalizeMasterPubkey(rawPubkey);

  setEnvInFile(join(dmBotRoot, '.env'), 'BOT_MASTER_PUBKEY', masterPubkey);
  process.env.BOT_MASTER_PUBKEY = masterPubkey;

  return { masterPubkey };
}

export function generateSetupBotKey({
  dmBotRoot,
}: GenerateBotKeyProps): GenerateBotKeyResult {
  const secretKey = generateSecretKey();
  const botKeyHex = Buffer.from(secretKey).toString('hex');
  const botPubkey = getPublicKey(secretKey);
  const envPath = join(dmBotRoot, '.env');

  setEnvInFile(envPath, 'BOT_KEY', botKeyHex);
  setEnvInFile(envPath, 'BOT_PUBKEY', botPubkey);
  process.env.BOT_KEY = botKeyHex;
  process.env.BOT_PUBKEY = botPubkey;

  secretKey.fill(0);

  return { botPubkey };
}

export function setSetupRelays({
  dmBotRoot,
  rawRelays,
}: SetRelaysProps): SetRelaysResult {
  const joined = rawRelays.join(',');
  const relays = parseRelayUrls(joined);

  if (relays.length === 0) {
    throw new Error('invalid_relays');
  }

  for (const relay of relays) {
    try {
      const url = new URL(relay);

      if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
        throw new Error('invalid_relays');
      }
    } catch {
      throw new Error('invalid_relays');
    }
  }

  const envValue = relays.join(',');

  setEnvInFile(join(dmBotRoot, '.env'), 'BOT_RELAYS', envValue);
  process.env.BOT_RELAYS = envValue;

  return { relays };
}

export function setSetupCursorApiKey({
  dmBotRoot,
  apiKey,
}: SetCursorApiKeyProps): SetCursorApiKeyResult {
  const trimmed = apiKey.trim();

  if (trimmed.length === 0) {
    throw new Error('invalid_cursor_api_key');
  }

  setEnvInFile(join(dmBotRoot, '.env'), 'CURSOR_API_KEY', trimmed);
  process.env.CURSOR_API_KEY = trimmed;

  return { saved: true };
}

export function setSetupProviderApiKey({
  dmBotRoot,
  values,
}: SetProviderApiKeyProps): SetProviderApiKeyResult {
  const entries = Object.entries(values)
    .map(([name, value]) => [name.trim(), value.trim()] as const)
    .filter(([, value]) => value.length > 0);

  if (
    entries.length === 0 ||
    entries.some(([name]) => !/^[A-Z0-9_]+$/.test(name))
  ) {
    throw new Error('invalid_provider_api_key');
  }

  for (const [name, value] of entries) {
    setEnvInFile(join(dmBotRoot, '.env'), name, value);
    process.env[name] = value;
  }

  return { envNames: entries.map(([name]) => name), saved: true };
}

export function setupWebPush({
  dmBotRoot,
  subjectRaw,
  generateNewKeys,
}: SetupWebPushProps): SetupWebPushResult {
  const subject = normalizeVapidSubject(subjectRaw);

  if (!subject) {
    throw new Error('invalid_web_push_subject');
  }

  const envPath = join(dmBotRoot, '.env');

  const keys = generateNewKeys
    ? generateVAPIDKeys()
    : {
        publicKey: process.env.BOT_WEB_PUSH_PUBLIC_KEY?.trim() ?? '',
        privateKey: process.env.BOT_WEB_PUSH_PRIVATE_KEY?.trim() ?? '',
      };

  if (!keys.publicKey || !keys.privateKey) {
    throw new Error('missing_web_push_keys');
  }

  setEnvInFile(envPath, 'BOT_WEB_PUSH_PUBLIC_KEY', keys.publicKey);
  setEnvInFile(envPath, 'BOT_WEB_PUSH_PRIVATE_KEY', keys.privateKey);
  setEnvInFile(envPath, 'BOT_WEB_PUSH_SUBJECT', subject);
  process.env.BOT_WEB_PUSH_PUBLIC_KEY = keys.publicKey;
  process.env.BOT_WEB_PUSH_PRIVATE_KEY = keys.privateKey;
  process.env.BOT_WEB_PUSH_SUBJECT = subject;

  return { publicKey: keys.publicKey, subject };
}

export function setSetupPiperConfig({
  dmBotRoot,
  binaryPath,
  modelPath,
  libraryPath,
}: SetPiperConfigProps): SetPiperConfigResult {
  const values = {
    binaryPath: binaryPath.trim(),
    modelPath: modelPath.trim(),
    libraryPath: libraryPath.trim(),
  };

  const envPath = join(dmBotRoot, '.env');

  setEnvInFile(envPath, 'BOT_PIPER_BINARY_PATH', values.binaryPath);
  setEnvInFile(envPath, 'BOT_PIPER_MODEL_PATH', values.modelPath);
  setEnvInFile(envPath, 'BOT_PIPER_LIBRARY_PATH', values.libraryPath);

  process.env.BOT_PIPER_BINARY_PATH = values.binaryPath;
  process.env.BOT_PIPER_MODEL_PATH = values.modelPath;
  process.env.BOT_PIPER_LIBRARY_PATH = values.libraryPath;

  return values;
}

async function downloadFile(url: string, filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    return;
  }

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`piper_model_download_failed:${res.status}`);
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
}

export async function downloadSetupPiperModel({
  dmBotRoot,
}: DownloadPiperModelProps): Promise<DownloadPiperModelResult> {
  const modelPath = join(
    dmBotRoot,
    'models',
    'piper',
    'en_US-libritts_r-medium.onnx',
  );

  const configPath = `${modelPath}.json`;

  await downloadFile(DEFAULT_PIPER_MODEL_URL, modelPath);
  await downloadFile(DEFAULT_PIPER_MODEL_CONFIG_URL, configPath);

  setEnvInFile(join(dmBotRoot, '.env'), 'BOT_PIPER_MODEL_PATH', modelPath);
  process.env.BOT_PIPER_MODEL_PATH = modelPath;

  return { modelPath, configPath };
}

export function setSetupDefaults({
  db,
  dmBotRoot,
  parentOfBotRoot,
  input,
}: SetSetupDefaultsProps): SetupDefaultsResult {
  const prefix = DmCommandPrefixSchema.parse(input.prefix.trim());
  const backend = AgentBackendNameSchema.parse(input.backend);
  const provider = ProviderNameSchema.parse(input.provider);
  const mode = AgentModeSchema.parse(input.mode);
  const workspace = WorkspaceTargetSchema.parse(input.workspace);
  const linting = LintingSchema.parse(input.linting);
  const readyNotification = input.readyNotification;

  setDmCommandPrefix(db, prefix);
  setAgentBackend(db, backend);
  setProviderName(db, provider);
  setDefaultMode(db, mode);
  setWorkspaceTarget(db, workspace);
  setLinting(db, linting);
  markSetupConfigured(db);

  const readyValue = readyNotification ? '1' : '0';
  setEnvInFile(join(dmBotRoot, '.env'), 'READY_ENABLED', readyValue);
  process.env.READY_ENABLED = readyValue;

  const parentWorkspaceInstall = ensureOpencodeParentWorkspaceAssets({
    backend,
    workspace,
    dmBotRoot,
    parentOfBotRoot,
  });

  return {
    defaults: {
      prefix,
      backend,
      provider,
      mode,
      workspace,
      linting,
      readyNotification,
    },
    parentWorkspaceInstall,
  };
}
