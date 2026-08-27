import { buildActiveRuntimeContext } from '@src/backends/agent-runtime-context';
import type { AgentStreamChunk } from '@src/backends/agent-stream-chunk';
import { createBackend } from '@src/backends/factory';
import { getOutputString } from '@src/backends/types';
import { readAgentsInstructions } from '@src/core/agent-instructions';
import {
  getAgentBackend,
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getModelOverride,
  getProviderName,
  getWorkspaceInstructions,
} from '@src/db';
import { getWorkspaceTarget } from '@src/db';
import { debug } from '@src/logger';
import { getOrCreateCurrentSession } from '@src/session';

import type { WebRouteContext } from './routes';

export type RunWebChatProps = {
  ctx: WebRouteContext;
  content: string;
  onSessionReady: ((sessionId: string) => void) | null;
  onStreamChunk: ((chunk: AgentStreamChunk) => void) | null;
  streamAbortSignal: AbortSignal | null;
};

export async function runWebChat(
  props: RunWebChatProps,
): Promise<{ output: string; sessionId: string }> {
  const { ctx, content, onSessionReady, onStreamChunk, streamAbortSignal } =
    props;

  const mode = getCurrentOrDefaultMode(ctx.seenDb);
  const backendName = getAgentBackend(ctx.seenDb);
  const executionProfile = getBackendExecutionProfile(ctx.seenDb, backendName);
  const modelOverride = getModelOverride(ctx.seenDb, backendName);
  const workspace = getWorkspaceTarget(ctx.seenDb);

  const backend = createBackend({
    backendName,
    dmBotRoot: ctx.dmBotRoot,
    cursorMode: mode,
    opencodeAgentName:
      executionProfile.kind === 'opencode' ? executionProfile.agent : null,
    attachUrl: ctx.attachUrl,
    modelOverride,
    providerName: getProviderName(ctx.seenDb),
  });

  const cwd = workspace === 'appweaver' ? ctx.dmBotRoot : ctx.parentOfBotRoot;

  const sessionId = await getOrCreateCurrentSession({
    db: ctx.seenDb,
    backend,
    cwd,
  });

  onSessionReady?.(sessionId);

  debug('web chat handing prompt to backend', {
    backend: backendName,
    sessionId,
    contentLength: content.length,
    contentPreview: content.slice(0, 120),
    aborted: streamAbortSignal?.aborted ?? false,
  });

  const useStream =
    (backendName === 'opencode' || backendName === 'cursor') &&
    onStreamChunk !== null &&
    streamAbortSignal !== null;

  const result = await backend.runMessage({
    sessionId,
    content,
    cursorMode: mode,
    opencodeAgentName:
      executionProfile.kind === 'opencode' ? executionProfile.agent : null,
    cwd,
    context: {
      runtimeContext: buildActiveRuntimeContext({
        backendName,
        agentName:
          executionProfile.kind === 'opencode' ? executionProfile.agent : mode,
        dmBotRoot: ctx.dmBotRoot,
        cwd,
      }),
      workspaceInstructions: getWorkspaceInstructions(ctx.seenDb, workspace)
        .instructions,
      agentsInstructions:
        workspace === 'appweaver'
          ? readAgentsInstructions({
              workspaceTarget: workspace,
              dmBotRoot: ctx.dmBotRoot,
              parentOfBotRoot: ctx.parentOfBotRoot,
            })
          : null,
      extraInstructions: null,
    },
    getRoutstrSkKey: () => null,
    modelOverride,
    onAgentStreamChunk: useStream ? onStreamChunk : null,
    streamAbortSignal: useStream ? streamAbortSignal : null,
  });

  debug('web chat backend returned', {
    backend: backendName,
    sessionId: result.sessionId,
    resultType: result.type,
    outputLength: getOutputString(result).length,
    aborted: streamAbortSignal?.aborted ?? false,
  });

  return {
    output: getOutputString(result),
    sessionId: result.sessionId,
  };
}
