import type { Database as BunDatabase } from 'bun:sqlite';
import { z } from 'zod';

import type { Msats } from '../types';
import type { Brand } from '../types';

export const AgentModeSchema = z.enum(['free', 'ask', 'plan', 'agent']);
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const AgentBackendNameSchema = z.enum(['cursor', 'opencode']);
export type AgentBackendName = z.infer<typeof AgentBackendNameSchema>;

export const ProviderNameSchema = z.enum(['local', 'routstr']);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

export const WorkspaceTargetSchema = z.enum(['parent', 'appweaver']);
export type WorkspaceTarget = z.infer<typeof WorkspaceTargetSchema>;

export const LintingSchema = z.enum(['on', 'off']);
export type Linting = z.infer<typeof LintingSchema>;

export const STATE_CURRENT_SESSION = 'current_session_id';
export const STATE_DEFAULT_MODE = 'default_mode';
export const STATE_AGENT_BACKEND = 'agent_backend';
export const STATE_WORKSPACE_TARGET = 'workspace_target';
export const STATE_MODEL_OVERRIDE = 'model_override';
export const STATE_OPENCODE_AGENT = 'opencode_agent';
export const STATE_PROVIDER_NAME = 'provider_name';
export const STATE_ROUTSTR_BUDGET_MSATS = 'routstr_budget_msats';
export const STATE_ROUTSTR_SK_KEY = 'routstr_sk_key';
export const STATE_ROUTSTR_MODEL = 'routstr_model';
export const STATE_ROUTSTR_MODELS_CACHE = 'routstr_models_cache';
export const STATE_ROUTSTR_MODELS_CACHE_TS = 'routstr_models_cache_ts';
export const STATE_CASHU_DEFAULT_MINT_URL = 'cashu_default_mint_url';
export const STATE_LINTING = 'linting';
export const STATE_DM_COMMAND_PREFIX = 'dm_command_prefix';
export const STATE_SETUP_CONFIGURED_AT = 'setup_configured_at';

/** First character(s) of a DM line that mark it as a command (stored in core DB). */
export const DmCommandPrefixSchema = z
  .string()
  .min(1)
  .max(8)
  .refine((s) => !/\s/.test(s), {
    message: 'prefix must not contain whitespace',
  });

export type DmCommandPrefix = z.infer<typeof DmCommandPrefixSchema>;

export const DEFAULT_MODE: AgentMode = 'ask';
export const DEFAULT_BACKEND: AgentBackendName = 'opencode';
export const DEFAULT_WORKSPACE_TARGET: WorkspaceTarget = 'parent';
export const DEFAULT_PROVIDER: ProviderName = 'local';
export const DEFAULT_LINTING: Linting = 'off';

/** Default when `state.dm_command_prefix` is unset (mobile-friendly). */
export const DEFAULT_DM_COMMAND_PREFIX: DmCommandPrefix = '/';

export type CoreDb = Brand<BunDatabase, 'CoreDb'>;
export type RoutstrModelCache = {
  id: string;
  name?: string;
  context_length?: number;
}[];
export type { Msats };
