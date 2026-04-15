import { z } from 'zod';

import { createBackend } from '@src/backends/factory';
import {
  AgentBackendNameSchema,
  AgentModeSchema,
  LintingSchema,
  ProviderNameSchema,
  ReplyTransportSchema,
  WorkspaceTargetSchema,
  getAgentBackend,
  getCurrentOrDefaultMode,
  getLinting,
  getModelOverride,
  getProviderName,
  getReplyTransport,
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
  linting: LintingSchema,
  modelOverride: z.string().nullable(),
  resolvedModelName: z.string().min(1),
  workspace: WorkspaceTargetSchema,
  transport: ReplyTransportSchema,
  botRelayUrls: z.array(z.string()),
  sessionId: z.string().nullable(),
  opencodeServeUrl: z.string().nullable(),
  routstrBudgetMsatsRaw: z.number().int().nonnegative().nullable(),
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
  const replyTransport = getReplyTransport(seenDb);
  const workspace = getWorkspaceTarget(seenDb);
  const serveUrl = process.env.BOT_OPENCODE_SERVE_URL;
  const modelOverride = getModelOverride(seenDb, backendName);
  const providerName = getProviderName(seenDb);

  const backend = createBackend({
    backendName,
    dmBotRoot,
    mode,
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
    linting,
    modelOverride,
    resolvedModelName: backend.modelName,
    workspace,
    transport: replyTransport,
    botRelayUrls,
    sessionId: cur,
    opencodeServeUrl: opencodeServeUrlAttached,
    routstrBudgetMsatsRaw,
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
