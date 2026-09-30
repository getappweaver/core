import { buildActiveRuntimeContext } from '@src/backends/agent-runtime-context';
import type { AgentStreamChunk } from '@src/backends/agent-stream-chunk';
import { createBackend } from '@src/backends/factory';
import { opencodeRuntimeController } from '@src/backends/opencode-runtime-controller';
import { getOutputString } from '@src/backends/types';
import { readAgentsInstructions } from '@src/core/agent-instructions';
import { createModelSourceCoordinator } from '@src/core/model-source';
import { getWorkspaceInstructions } from '@src/db';
import { getWorkspaceTarget } from '@src/db';
import { debug } from '@src/logger';
import { assertWebSession } from '@src/session';

import type { WebRouteContext } from './routes';

export type RunWebChatProps = {
  ctx: WebRouteContext;
  content: string;
  sessionId: string;
  onSessionReady: ((sessionId: string) => void) | null;
  onStreamChunk: ((chunk: AgentStreamChunk) => void) | null;
  streamAbortSignal: AbortSignal | null;
};

export async function runWebChat(
  props: RunWebChatProps,
): Promise<{ output: string; sessionId: string }> {
  const {
    ctx,
    content,
    sessionId,
    onSessionReady,
    onStreamChunk,
    streamAbortSignal,
  } = props;

  const workspace = getWorkspaceTarget(ctx.seenDb);

  return opencodeRuntimeController.withPreparedRun({
    workspace,
    prepare: () =>
      createModelSourceCoordinator(ctx.seenDb).prepareRun(
        workspace,
        'opencode',
      ),
    run: async (prepared) => {
      assertWebSession(ctx.seenDb, sessionId, workspace);

      const backend = createBackend({
        backendName: 'opencode',
        dmBotRoot: ctx.dmBotRoot,
      });

      const cwd =
        workspace === 'appweaver' ? ctx.dmBotRoot : ctx.parentOfBotRoot;

      onSessionReady?.(sessionId);

      debug('web chat handing prompt to backend', {
        backend: 'opencode',
        sessionId,
        contentLength: content.length,
        contentPreview: content.slice(0, 120),
        aborted: streamAbortSignal?.aborted ?? false,
      });

      const useStream = onStreamChunk !== null && streamAbortSignal !== null;

      const result = await backend.runMessage({
        sessionId,
        content,
        cwd,
        context: {
          runtimeContext: buildActiveRuntimeContext({
            backendName: 'opencode',
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
        modelOverride: prepared.runtimeModelId,
        onAgentStreamChunk: useStream ? onStreamChunk : null,
        streamAbortSignal: useStream ? streamAbortSignal : null,
      });

      debug('web chat backend returned', {
        backend: 'opencode',
        sessionId: result.sessionId,
        resultType: result.type,
        outputLength: getOutputString(result).length,
        aborted: streamAbortSignal?.aborted ?? false,
      });

      if (result.type === 'success') {
        await createModelSourceCoordinator(ctx.seenDb).recordSuccessfulUse(
          workspace,
          'opencode',
          prepared.modelId,
          prepared.providerId,
        );
      }

      return {
        output: getOutputString(result),
        sessionId: result.sessionId,
      };
    },
  });
}
