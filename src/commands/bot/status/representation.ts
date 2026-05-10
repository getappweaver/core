import { z } from 'zod';

import { listCachedCursorSdkModelCatalog } from '@src/backends/cursor-sdk';
import { createBackend } from '@src/backends/factory';
import { resolveConfiguredModelFromOpencodeConfig } from '@src/backends/opencode-common';
import {
  listOpencodeModelCatalog,
  readOpencodeConfig,
} from '@src/backends/opencode-config';
import {
  AgentBackendNameSchema,
  AgentModeSchema,
  LintingSchema,
  ProviderNameSchema,
  WorkspaceTargetSchema,
  getAgentBackend,
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getLinting,
  getModelOverride,
  getProviderName,
  getRoutstrBudget,
  getState,
  getWorkspaceTarget,
  STATE_CURRENT_SESSION,
  type CoreDb,
} from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';
import { msatsRaw } from '@src/types';

export type StatusProps = {
  botRelayUrls: string[];
  seenDb: CoreDb;
  version: string;
  dmBotRoot: string;
  attachUrl: string | null;
};

export const BotStatusDataSchema = z.object({
  backend: AgentBackendNameSchema,
  provider: ProviderNameSchema,
  version: z.string().min(1),
  mode: AgentModeSchema,
  executionProfileKind: z.enum(['mode', 'agent']),
  executionProfileDisplayName: z.string().min(1),
  linting: LintingSchema,
  modelOverride: z.string().nullable(),
  opencodeRootModel: z.string().nullable(),
  opencodeAgentModel: z.string().nullable(),
  opencodeAgentNames: z.array(z.string()),
  resolvedModelName: z.string().min(1),
  effectiveModelSource: z.enum(['override', 'agent', 'root', 'default']),
  workspace: WorkspaceTargetSchema,
  botRelayUrls: z.array(z.string()),
  sessionId: z.string().nullable(),
  opencodeServeUrl: z.string().nullable(),
  routstrBudgetMsatsRaw: z.number().int().nonnegative().nullable(),
  opencodeModelCatalog: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
    }),
  ),
});

export const BotStatusRepresentationSchema = createRepresentationSchema(
  BotStatusDataSchema,
).extend({
  kind: z.literal('bot.status'),
});

export type BotStatusRepresentation = z.infer<
  typeof BotStatusRepresentationSchema
>;

export type BotStatusData = z.infer<typeof BotStatusDataSchema>;

export function buildBotStatusData(props: StatusProps): BotStatusData {
  const { botRelayUrls, seenDb, version, dmBotRoot, attachUrl } = props;

  const mode = getCurrentOrDefaultMode(seenDb);
  const linting = getLinting(seenDb);
  const backendName = getAgentBackend(seenDb);
  const workspace = getWorkspaceTarget(seenDb);
  const serveUrl = process.env.BOT_OPENCODE_SERVE_URL;
  const modelOverride = getModelOverride(seenDb, backendName);
  const providerName = getProviderName(seenDb);
  const executionProfile = getBackendExecutionProfile(seenDb, backendName);

  const opencodeConfigured =
    backendName === 'opencode'
      ? resolveConfiguredModelFromOpencodeConfig(
          dmBotRoot,
          executionProfile.kind === 'opencode' ? executionProfile.agent : mode,
        )
      : null;

  const opencodeConfig =
    backendName === 'opencode' ? readOpencodeConfig(dmBotRoot) : null;

  const opencodeModelCatalog =
    backendName === 'opencode'
      ? listOpencodeModelCatalog(dmBotRoot)
      : backendName === 'cursor'
        ? listCachedCursorSdkModelCatalog()
        : [];

  const backend = createBackend({
    backendName,
    dmBotRoot,
    cursorMode: mode,
    opencodeAgentName:
      executionProfile.kind === 'opencode' ? executionProfile.agent : null,
    attachUrl,
    modelOverride,
    providerName,
  });

  const cur = getState(seenDb, STATE_CURRENT_SESSION);

  const opencodeServeUrlAttached =
    backendName === 'opencode' && serveUrl ? serveUrl : null;

  const routstrBudgetMsatsRaw =
    providerName === 'routstr' ? msatsRaw(getRoutstrBudget(seenDb)) : null;

  return {
    backend: backendName,
    provider: providerName,
    version,
    mode,
    executionProfileKind:
      executionProfile.kind === 'cursor' ? 'mode' : ('agent' as const),
    executionProfileDisplayName:
      executionProfile.kind === 'opencode'
        ? executionProfile.agent
        : mode === 'agent' || mode === 'free'
          ? 'yolo'
          : mode,
    linting,
    modelOverride,
    opencodeRootModel: opencodeConfigured?.rootModel ?? null,
    opencodeAgentModel: opencodeConfigured?.agentModel ?? null,
    opencodeAgentNames: opencodeConfig?.agents.map((agent) => agent.name) ?? [],
    resolvedModelName: backend.modelName,
    effectiveModelSource: modelOverride
      ? 'override'
      : (opencodeConfigured?.source ?? 'default'),
    workspace,
    botRelayUrls,
    sessionId: cur,
    opencodeServeUrl: opencodeServeUrlAttached,
    routstrBudgetMsatsRaw,
    opencodeModelCatalog,
  };
}

export function createBotStatusRepresentation(
  props: StatusProps,
): BotStatusRepresentation {
  return {
    kind: 'bot.status',
    version: 1,
    meta: { command: 'bot', subcommand: 'status' },
    data: buildBotStatusData(props),
  };
}
