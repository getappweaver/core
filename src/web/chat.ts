import type { AgentStreamChunk } from '@src/backends/agent-stream-chunk';
import { createBackend } from '@src/backends/factory';
import { getOutputString } from '@src/backends/types';
import {
  getAgentBackend,
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getModelOverride,
  getProviderName,
} from '@src/db';
import { getWorkspaceTarget } from '@src/db';
import { getOrCreateCurrentSession } from '@src/session';

import type { WebRouteContext } from './routes';

export type RunWebChatProps = {
  ctx: WebRouteContext;
  content: string;
  onStreamChunk: ((chunk: AgentStreamChunk) => void) | null;
  streamAbortSignal: AbortSignal | null;
};

export async function runWebChat(
  props: RunWebChatProps,
): Promise<{ output: string; sessionId: string }> {
  const { ctx, content, onStreamChunk, streamAbortSignal } = props;
  const mode = getCurrentOrDefaultMode(ctx.seenDb);
  const backendName = getAgentBackend(ctx.seenDb);
  const executionProfile = getBackendExecutionProfile(ctx.seenDb, backendName);
  const modelOverride = getModelOverride(ctx.seenDb, backendName);

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

  const cwd =
    getWorkspaceTarget(ctx.seenDb) === 'appweaver'
      ? ctx.dmBotRoot
      : ctx.parentOfBotRoot;

  const sessionId = await getOrCreateCurrentSession({
    db: ctx.seenDb,
    backend,
    cwd,
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
    getRoutstrSkKey: () => null,
    modelOverride,
    onAgentStreamChunk: useStream ? onStreamChunk : null,
    streamAbortSignal: useStream ? streamAbortSignal : null,
  });

  return {
    output: getOutputString(result),
    sessionId: result.sessionId,
  };
}
