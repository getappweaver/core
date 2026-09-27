import { existsSync } from 'fs';

import { Database } from 'bun:sqlite';
import { z } from 'zod';

import { CORE_DB_PATH } from '../paths';
import {
  decryptLegacySecretCiphertext,
  decryptSecret,
  encryptSecret,
  initSecretEncryption,
} from '../security/encrypted-secret';
import { msats, msatsRaw } from '../types';

import {
  AgentBackendNameSchema,
  DEFAULT_BACKEND,
  DEFAULT_DM_COMMAND_PREFIX,
  DEFAULT_LINTING,
  DmCommandPrefixSchema,
  DEFAULT_PROVIDER,
  DEFAULT_WORKSPACE_TARGET,
  LintingSchema,
  ProviderNameSchema,
  STATE_AGENT_BACKEND,
  STATE_CASHU_DEFAULT_MINT_URL,
  STATE_DM_COMMAND_PREFIX,
  STATE_LINTING,
  STATE_INTERVENTION_MODE,
  STATE_MODEL_OVERRIDE,
  STATE_PROVIDER_NAME,
  STATE_ROUTSTR_BUDGET_MSATS,
  STATE_ROUTSTR_MODEL,
  STATE_ROUTSTR_MODELS_CACHE,
  STATE_ROUTSTR_MODELS_CACHE_TS,
  STATE_ROUTSTR_SK_KEY,
  STATE_SETUP_CONFIGURED_AT,
  STATE_WORKSPACE_TARGET,
  type AgentBackendName,
  type CoreDb,
  type DmCommandPrefix,
  type Linting,
  type Msats,
  type ProviderName,
  type RoutstrModelCache,
  type WorkspaceTarget,
  WorkspaceTargetSchema,
} from './shared';

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
  initSecretEncryption(botKeyHex, botPubkey);
}

export function getState(db: CoreDb, key: string): string | null {
  const row = db.prepare('SELECT value FROM state WHERE key = ?').get(key) as
    { value: string } | undefined;

  return row?.value ?? null;
}

export function setState(db: CoreDb, key: string, value: string): void {
  db.run('INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)', [
    key,
    value,
  ]);
}

export function getInterventionMode(db: CoreDb): boolean {
  return getState(db, STATE_INTERVENTION_MODE) === 'on';
}

export function setInterventionMode(db: CoreDb, enabled: boolean): void {
  setState(db, STATE_INTERVENTION_MODE, enabled ? 'on' : 'off');
}

export function markSetupConfigured(db: CoreDb): void {
  setState(db, STATE_SETUP_CONFIGURED_AT, new Date().toISOString());
}

function normalizeBackendName(value: string | null): AgentBackendName | null {
  if (
    value === 'cursor' ||
    value === 'cursor-sdk' ||
    value === 'opencode-sdk'
  ) {
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

  return getState(db, `${STATE_MODEL_OVERRIDE}:opencode-sdk`);
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

  let value: unknown;

  try {
    value = JSON.parse(stored) as unknown;
  } catch {
    value = null;
  }

  if (value !== null) {
    return decryptSecret(value);
  }

  // Legacy plaintext Routstr keys are fixed-width hex. Every other legacy value
  // must decrypt successfully; a failed decrypt is never interpreted as plain.
  const legacyValue = /^[0-9a-f]{64}$/i.test(stored)
    ? stored
    : decryptLegacySecretCiphertext(stored);

  setRoutstrSkKey(db, legacyValue);

  return legacyValue;
}

export function setRoutstrSkKey(db: CoreDb, key: string): void {
  setState(db, STATE_ROUTSTR_SK_KEY, JSON.stringify(encryptSecret(key)));
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
