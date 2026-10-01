import { spawnSync } from 'node:child_process';

import { buildActiveRuntimeContext } from '../backends/agent-runtime-context';
import { createBackend } from '../backends/factory';
import type { AgentRunResult } from '../backends/types';
import { getOutputString } from '../backends/types';
import { readAgentsInstructions } from '../core/agent-instructions';
import {
  createModelSourceCoordinator,
  type PreparedModelRun,
} from '../core/model-source';
import type { CoreDb, WorkspaceTarget } from '../db';
import { getLinting, getWorkspaceInstructions } from '../db';
import { formatLintSummary, runPostAgentLint } from '../lint';
import { C, log } from '../logger';
import { getAppWeaverSessionTitle, insertSessionMessage } from '../session';

const POST_AGENT_LINT_PROMPT_PREFIX = '[Post-edit lint feedback]';

function workingTreeFingerprint(cwd: string): string {
  const result = spawnSync('git', ['diff', '--no-ext-diff', '--binary'], {
    cwd,
    encoding: 'utf8',
  });

  return result.status === 0 ? result.stdout : '';
}

export type RunAgentWithLintFollowUpProps = {
  dmBotRoot: string;
  sessionId: string;
  cwd: string;
  coreDb: CoreDb;
  effectiveContent: string;
  currentWorkspace: WorkspaceTarget;
  prepared: PreparedModelRun;
};

export async function runAgentWithLintFollowUp({
  dmBotRoot,
  sessionId,
  cwd,
  coreDb,
  effectiveContent,
  currentWorkspace,
  prepared,
}: RunAgentWithLintFollowUpProps): Promise<{
  output: string;
  result: AgentRunResult;
}> {
  const modelSources = createModelSourceCoordinator(coreDb);

  const trackedWorkspace = coreDb
    .prepare('SELECT workspace FROM sessions WHERE id = ?')
    .get(sessionId) as { workspace: WorkspaceTarget | null } | undefined;

  const titleSessionId =
    trackedWorkspace?.workspace === currentWorkspace ? sessionId : null;

  const runAgentRound = async (content: string, label: string) => {
    log.info(label);

    const backend = createBackend({
      backendName: 'opencode',
      dmBotRoot: cwd,
    });

    return backend.runMessage({
      sessionId,
      content,
      cwd,
      context: {
        runtimeContext: buildActiveRuntimeContext({
          backendName: 'opencode',
          dmBotRoot,
          cwd,
          sessionId: titleSessionId,
          sessionTitle: titleSessionId
            ? getAppWeaverSessionTitle(coreDb, titleSessionId)
            : null,
        }),
        workspaceInstructions: getWorkspaceInstructions(
          coreDb,
          currentWorkspace,
        ).instructions,
        agentsInstructions:
          currentWorkspace === 'appweaver'
            ? readAgentsInstructions({
                workspaceTarget: currentWorkspace,
                dmBotRoot,
                parentOfBotRoot: cwd,
              })
            : null,
        extraInstructions: null,
      },
      modelOverride: prepared.runtimeModelId,
      onAgentStreamChunk: null,
      streamAbortSignal: null,
    });
  };

  const before = workingTreeFingerprint(cwd);

  const initialResult = await runAgentRound(
    effectiveContent,
    `${C.dim}Starting OpenCode...${C.reset}\n`,
  );

  let finalOutput = getOutputString(initialResult);
  let finalResult = initialResult;

  if (initialResult.type === 'success') {
    await modelSources.recordSuccessfulUse(
      currentWorkspace,
      'opencode',
      prepared.modelId,
      prepared.providerId,
    );
  }

  const filesChanged = before !== workingTreeFingerprint(cwd);

  if (
    initialResult.type === 'error' ||
    getLinting(coreDb) === 'off' ||
    !filesChanged
  ) {
    return { output: finalOutput, result: finalResult };
  }

  const lintLabel =
    currentWorkspace === 'appweaver' ? 'AppWeaver core' : 'workspace';

  const lintResult = runPostAgentLint({ cwd, label: lintLabel });

  if (!lintResult.available) {
    return { output: finalOutput, result: finalResult };
  }

  const lintSummary = formatLintSummary(lintResult);
  finalOutput = `${finalOutput}\n\n${lintSummary}`;

  if (lintResult.exitCode === 0) {
    return { output: finalOutput, result: finalResult };
  }

  const lintPrompt = `${POST_AGENT_LINT_PROMPT_PREFIX}\n${lintSummary}\n\nFix any lint issues and provide your final summary.`;
  insertSessionMessage(coreDb, sessionId, 'user', lintPrompt);

  const fixResult = await runAgentRound(
    lintPrompt,
    `${C.dim}Starting OpenCode (lint feedback)...${C.reset}\n`,
  );

  finalOutput = `${finalOutput}\n\n${getOutputString(fixResult)}`;
  finalResult = fixResult;

  if (fixResult.type === 'success') {
    await modelSources.recordSuccessfulUse(
      currentWorkspace,
      'opencode',
      prepared.modelId,
      prepared.providerId,
    );
  }

  return { output: finalOutput, result: finalResult };
}
