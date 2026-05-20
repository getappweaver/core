import { existsSync } from 'fs';

import { Database } from 'bun:sqlite';
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44';
import { hexToBytes } from 'nostr-tools/utils';
import { z } from 'zod';

import { log } from '../logger';
import { CORE_DB_PATH } from '../paths';
import { msats, msatsRaw } from '../types';
import { assertUnreachable } from '../utils';

import {
  AgentBackendNameSchema,
  AgentModeSchema,
  DEFAULT_BACKEND,
  DEFAULT_DM_COMMAND_PREFIX,
  DEFAULT_LINTING,
  DEFAULT_MODE,
  DmCommandPrefixSchema,
  DEFAULT_PROVIDER,
  DEFAULT_WORKSPACE_TARGET,
  LintingSchema,
  ProviderNameSchema,
  STATE_AGENT_BACKEND,
  STATE_CASHU_DEFAULT_MINT_URL,
  STATE_DEFAULT_MODE,
  STATE_DM_COMMAND_PREFIX,
  STATE_LINTING,
  STATE_MODEL_OVERRIDE,
  STATE_OPENCODE_AGENT,
  STATE_PROVIDER_NAME,
  STATE_ROUTSTR_BUDGET_MSATS,
  STATE_ROUTSTR_MODEL,
  STATE_ROUTSTR_MODELS_CACHE,
  STATE_ROUTSTR_MODELS_CACHE_TS,
  STATE_ROUTSTR_SK_KEY,
  STATE_SETUP_CONFIGURED_AT,
  STATE_WORKSPACE_TARGET,
  type AgentBackendName,
  type AgentMode,
  type CoreDb,
  type DmCommandPrefix,
  type Linting,
  type Msats,
  type ProviderName,
  type RoutstrModelCache,
  type WorkspaceTarget,
  WorkspaceTargetSchema,
} from './shared';

let skKeyConversationKey: Uint8Array | null = null;

export type SetupConfigurationSnapshot = {
  dbExists: boolean;
  stateTableExists: boolean;
  configuredAtExists: boolean;
};

export function readSetupConfigurationSnapshot(): SetupConfigurationSnapshot {
  if (!existsSync(CORE_DB_PATH)) {
    return {
      dbExists: false,
      stateTableExists: false,
      configuredAtExists: false,
    };
  }

  const db = new Database(CORE_DB_PATH);

  try {
    const stateTable = db
      .prepare(
        "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'state'",
      )
      .get() as { found: number } | undefined;

    const stateTableExists = stateTable !== undefined;

    if (!stateTableExists) {
      return {
        dbExists: true,
        stateTableExists: false,
        configuredAtExists: false,
      };
    }

    const configuredAt = db
      .prepare('SELECT 1 AS found FROM state WHERE key = ?')
      .get(STATE_SETUP_CONFIGURED_AT) as { found: number } | undefined;

    return {
      dbExists: true,
      stateTableExists: true,
      configuredAtExists: configuredAt !== undefined,
    };
  } finally {
    db.close();
  }
}

export function needsSetupBillboard(
  snapshot: SetupConfigurationSnapshot,
): boolean {
  return (
    !snapshot.dbExists ||
    !snapshot.stateTableExists ||
    !snapshot.configuredAtExists
  );
}

export function initSkKeyEncryption(
  botKeyHex: string,
  botPubkey: string,
): void {
  skKeyConversationKey = getConversationKey(hexToBytes(botKeyHex), botPubkey);
}

export function getState(db: CoreDb, key: string): string | null {
  const row = db.prepare('SELECT value FROM state WHERE key = ?').get(key) as
    | { value: string }
    | undefined;

  return row?.value ?? null;
}

export function setState(db: CoreDb, key: string, value: string): void {
  db.run('INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)', [
    key,
    value,
  ]);
}

export function markSetupConfigured(db: CoreDb): void {
  setState(db, STATE_SETUP_CONFIGURED_AT, new Date().toISOString());
}

export function getCurrentOrDefaultMode(db: CoreDb): AgentMode {
  const v = getState(db, STATE_DEFAULT_MODE);
  const parsed = AgentModeSchema.safeParse(v);

  if (!parsed.success) {
    return DEFAULT_MODE;
  }

  const mode = parsed.data;
  switch (mode) {
    case 'free':
      return mode;
    case 'ask':
      return mode;
    case 'plan':
      return mode;
    case 'agent':
      return mode;
    default:
      return assertUnreachable(mode);
  }
}

export function setDefaultMode(db: CoreDb, mode: AgentMode): void {
  setState(db, STATE_DEFAULT_MODE, mode);
}

export function getSelectedOpencodeAgent(db: CoreDb): string {
  const selected = getState(db, STATE_OPENCODE_AGENT)?.trim();

  if (selected) {
    return selected;
  }

  return getCurrentOrDefaultMode(db);
}

export function setSelectedOpencodeAgent(db: CoreDb, agentName: string): void {
  const trimmed = agentName.trim();

  if (trimmed.length === 0) {
    throw new Error('agent name cannot be empty');
  }

  setState(db, STATE_OPENCODE_AGENT, trimmed);
}

export type BackendExecutionProfile =
  | {
      kind: 'cursor';
      mode: AgentMode;
    }
  | {
      kind: 'opencode';
      agent: string;
    };

export function getBackendExecutionProfile(
  db: CoreDb,
  backendName: AgentBackendName,
): BackendExecutionProfile {
  if (backendName === 'cursor') {
    return {
      kind: 'cursor',
      mode: getCurrentOrDefaultMode(db),
    };
  }

  return {
    kind: 'opencode',
    agent: getSelectedOpencodeAgent(db),
  };
}

function normalizeBackendName(value: string | null): AgentBackendName | null {
  if (value === 'cursor-sdk') {
    return 'cursor';
  }

  if (value === 'opencode-sdk') {
    return 'opencode';
  }

  return AgentBackendNameSchema.safeParse(value).data ?? null;
}

export function getAgentBackend(db: CoreDb): AgentBackendName {
  const v = getState(db, STATE_AGENT_BACKEND);

  return normalizeBackendName(v) ?? DEFAULT_BACKEND;
}

export function setAgentBackend(db: CoreDb, backend: AgentBackendName): void {
  setState(db, STATE_AGENT_BACKEND, backend);
}

export function getWorkspaceTarget(db: CoreDb): WorkspaceTarget {
  const v = getState(db, STATE_WORKSPACE_TARGET);

  if (v === 'bot') {
    setState(db, STATE_WORKSPACE_TARGET, 'appweaver');

    return 'appweaver';
  }

  return WorkspaceTargetSchema.safeParse(v).data ?? DEFAULT_WORKSPACE_TARGET;
}

export function setWorkspaceTarget(db: CoreDb, target: WorkspaceTarget): void {
  setState(db, STATE_WORKSPACE_TARGET, target);
}

export function getModelOverride(
  db: CoreDb,
  backendName: AgentBackendName,
): string | null {
  const key = `${STATE_MODEL_OVERRIDE}:${backendName}`;

  const value = getState(db, key);

  if (value !== null) {
    return value;
  }

  const legacyBackendName =
    backendName === 'cursor' ? 'cursor-sdk' : 'opencode-sdk';

  return getState(db, `${STATE_MODEL_OVERRIDE}:${legacyBackendName}`);
}

export function setModelOverride(
  db: CoreDb,
  backendName: AgentBackendName,
  model: string | null,
): void {
  const key = `${STATE_MODEL_OVERRIDE}:${backendName}`;

  if (model === null) {
    db.run('DELETE FROM state WHERE key = ?', [key]);
  } else {
    setState(db, key, model);
  }
}

export function getProviderName(db: CoreDb): ProviderName {
  const v = getState(db, STATE_PROVIDER_NAME);

  return ProviderNameSchema.safeParse(v).data ?? DEFAULT_PROVIDER;
}

export function setProviderName(db: CoreDb, name: ProviderName): void {
  setState(db, STATE_PROVIDER_NAME, name);
}

export function getRoutstrBudget(seenDb: CoreDb): Msats {
  const v = getState(seenDb, STATE_ROUTSTR_BUDGET_MSATS);

  if (v === null) {
    return msats(0);
  }

  const parsed = z.coerce.number().safeParse(v);

  if (!parsed.success) {
    throw new Error(`Corrupt routstr budget in DB: "${v}"`);
  }

  return msats(parsed.data);
}

export function setRoutstrBudget(db: CoreDb, budgetMSats: Msats): void {
  setState(db, STATE_ROUTSTR_BUDGET_MSATS, String(msatsRaw(budgetMSats)));
}

export function getRoutstrSkKey(db: CoreDb): string | null {
  const stored = getState(db, STATE_ROUTSTR_SK_KEY);

  if (!stored) {
    return null;
  }

  if (!skKeyConversationKey) {
    log.warn('SK key encryption not initialized — returning raw value');

    return stored;
  }

  try {
    return decrypt(stored, skKeyConversationKey);
  } catch {
    return stored;
  }
}

export function setRoutstrSkKey(db: CoreDb, key: string): void {
  if (!skKeyConversationKey) {
    log.warn('SK key encryption not initialized — storing raw value');
    setState(db, STATE_ROUTSTR_SK_KEY, key);

    return;
  }

  setState(db, STATE_ROUTSTR_SK_KEY, encrypt(key, skKeyConversationKey));
}

export function getWalletDefaultMintUrl(
  db: CoreDb,
  defaultMintUrl: string | null,
): string | null {
  return getState(db, STATE_CASHU_DEFAULT_MINT_URL) ?? defaultMintUrl;
}

export function setWalletDefaultMintUrl(db: CoreDb, url: string): void {
  setState(db, STATE_CASHU_DEFAULT_MINT_URL, url);
}

export function getRoutstrModel(db: CoreDb): string | null {
  return getState(db, STATE_ROUTSTR_MODEL);
}

export function setRoutstrModel(db: CoreDb, model: string | null): void {
  if (model === null) {
    db.run('DELETE FROM state WHERE key = ?', [STATE_ROUTSTR_MODEL]);
  } else {
    setState(db, STATE_ROUTSTR_MODEL, model);
  }
}

export function getCachedRoutstrModels(db: CoreDb): {
  models: RoutstrModelCache;
  ts: number;
} | null {
  const ts = Number(getState(db, STATE_ROUTSTR_MODELS_CACHE_TS) ?? '0');

  if (Date.now() - ts > 86_400_000) {
    return null;
  }

  const raw = getState(db, STATE_ROUTSTR_MODELS_CACHE);
  const models = raw ? (JSON.parse(raw) as RoutstrModelCache) : null;

  return models ? { models, ts } : null;
}

export function setCachedRoutstrModels(
  db: CoreDb,
  models: RoutstrModelCache,
): void {
  setState(db, STATE_ROUTSTR_MODELS_CACHE, JSON.stringify(models));
  setState(db, STATE_ROUTSTR_MODELS_CACHE_TS, String(Date.now()));
}

export function getLinting(db: CoreDb): Linting {
  const v = getState(db, STATE_LINTING);

  return LintingSchema.safeParse(v).data ?? DEFAULT_LINTING;
}

export function setLinting(db: CoreDb, value: Linting): void {
  setState(db, STATE_LINTING, value);
}

export function getDmCommandPrefix(db: CoreDb): DmCommandPrefix {
  const v = getState(db, STATE_DM_COMMAND_PREFIX);

  if (v === null) {
    return DEFAULT_DM_COMMAND_PREFIX;
  }

  const parsed = DmCommandPrefixSchema.safeParse(v);

  if (!parsed.success) {
    return DEFAULT_DM_COMMAND_PREFIX;
  }

  return parsed.data;
}

export function setDmCommandPrefix(db: CoreDb, prefix: string): void {
  const parsed = DmCommandPrefixSchema.safeParse(prefix);

  if (!parsed.success) {
    throw new Error(
      `Invalid DM command prefix "${prefix}": use 1–8 non-whitespace characters.`,
    );
  }

  setState(db, STATE_DM_COMMAND_PREFIX, parsed.data);
}
