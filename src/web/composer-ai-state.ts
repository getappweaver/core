import { createBackend } from '@src/backends/factory';
import {
  getOpencodeAgent,
  listOpencodeModelCatalog,
  readOpencodeConfig,
} from '@src/backends/opencode-config';
import { getOpencodeSdkContextStats } from '@src/backends/opencode-sdk';
import {
  getAgentBackend,
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getModelOverride,
  getProviderName,
  getState,
  getWorkspaceTarget,
  STATE_CURRENT_SESSION,
} from '@src/db';
import type { WebArgumentFieldChoice } from '@src/web/ui-schema';

import type { WebRouteContext } from './routes';

export type ComposerAiState = {
  backend: string;
  executionProfileLabel: 'Agent' | 'Mode';
  executionProfileName: string;
  executionProfileColor: string | null;
  effectiveModel: string;
  provider: string;
  /** Current model override in DB; mirrors bot status “Override model”. */
  modelOverride: string | null;
  /** For `/ai model` and `/ai root-model` web forms. */
  opencodeModelFormChoices: WebArgumentFieldChoice[];
  contextStats: {
    tokensTotal: number;
    contextLimit: number | null;
    contextPercent: number | null;
  } | null;
};

export async function getComposerAiState(
  ctx: WebRouteContext,
): Promise<ComposerAiState> {
  const backendName = getAgentBackend(ctx.seenDb);
  const cursorMode = getCurrentOrDefaultMode(ctx.seenDb);
  const executionProfile = getBackendExecutionProfile(ctx.seenDb, backendName);
  const providerName = getProviderName(ctx.seenDb);

  const opencodeConfig =
    executionProfile.kind === 'opencode'
      ? readOpencodeConfig(ctx.dmBotRoot)
      : null;

  const opencodeAgent =
    executionProfile.kind === 'opencode'
      ? getOpencodeAgent(opencodeConfig!, executionProfile.agent)
      : null;

  const modelOverride = getModelOverride(ctx.seenDb, backendName);

  const backend = createBackend({
    backendName,
    dmBotRoot: ctx.dmBotRoot,
    cursorMode,
    opencodeAgentName:
      executionProfile.kind === 'opencode' ? executionProfile.agent : null,
    attachUrl: ctx.attachUrl,
    modelOverride,
    providerName,
  });

  const isOpencodeBackend = backendName === 'opencode';

  const opencodeModelFormChoices: WebArgumentFieldChoice[] = [
    { value: 'reset', label: 'Clear / reset' },
    ...(isOpencodeBackend
      ? listOpencodeModelCatalog(ctx.dmBotRoot)
      : backendName === 'cursor'
        ? (await backend.availableModels()).map((model) => ({
            value: model,
            label: model,
          }))
        : []),
  ];

  const cwd =
    getWorkspaceTarget(ctx.seenDb) === 'bot'
      ? ctx.dmBotRoot
      : ctx.parentOfBotRoot;

  const currentSessionId = getState(ctx.seenDb, STATE_CURRENT_SESSION);

  const contextStats =
    backendName === 'opencode' && currentSessionId
      ? await getOpencodeSdkContextStats({
          sessionId: currentSessionId,
          cwd,
          effectiveModel: backend.modelName,
        }).catch(() => null)
      : null;

  return {
    backend: backendName,
    executionProfileLabel:
      executionProfile.kind === 'cursor' ? 'Mode' : ('Agent' as const),
    executionProfileName:
      executionProfile.kind === 'cursor' &&
      (executionProfile.mode === 'agent' || executionProfile.mode === 'free')
        ? 'yolo'
        : executionProfile.kind === 'cursor'
          ? executionProfile.mode
          : executionProfile.agent,
    executionProfileColor: opencodeAgent?.color ?? null,
    effectiveModel: backend.modelName,
    provider: providerName,
    modelOverride,
    opencodeModelFormChoices,
    contextStats,
  };
}
