import { resolve } from 'node:path';

import { buildActiveRuntimeContext } from '@src/backends/agent-runtime-context';
import { createBackend } from '@src/backends/factory';
import { opencodeRuntimeController } from '@src/backends/opencode-runtime-controller';
import { getLastResolvedOpencodeModel } from '@src/backends/opencode-sdk';
import type { AgentBackend } from '@src/backends/types';
import {
  CORE_MODEL_SOURCE_PROVIDER_ID,
  getActiveModelSourceProviderId,
  getCoreSelectedModel,
  getWorkspaceInstructions,
  getWorkspaceTarget,
  type CoreDb,
} from '@src/db';

import { readAgentsInstructions } from './agent-instructions';
import { createModelSourceCoordinator } from './model-source';
import type {
  PluginAgentDefaults,
  PluginAgentRunProps,
  PluginAgentRunResult,
  PluginAgentService,
} from './plugin';

type CreatePluginAgentServiceProps = {
  db: CoreDb;
  dmBotRoot: string;
  parentOfBotRoot: string;
  attachUrl: string | null;
};

function registerSession(props: { db: CoreDb; sessionId: string }): void {
  props.db.run(
    `INSERT OR REPLACE INTO sessions (id, created_at, backend)
     VALUES (?, ?, 'opencode')`,
    [props.sessionId, Math.floor(Date.now() / 1000)],
  );
}

export function createPluginAgentService({
  db,
  dmBotRoot,
  parentOfBotRoot,
}: CreatePluginAgentServiceProps): PluginAgentService {
  const modelSources = createModelSourceCoordinator(db);

  async function prepared(workspaceTarget: 'parent' | 'appweaver') {
    return modelSources.prepareRun(workspaceTarget, 'opencode');
  }

  return {
    getDefaults(): PluginAgentDefaults {
      const workspaceTarget = getWorkspaceTarget(db);
      const cwd = workspaceTarget === 'appweaver' ? dmBotRoot : parentOfBotRoot;

      const model =
        getActiveModelSourceProviderId(db, workspaceTarget) ===
        CORE_MODEL_SOURCE_PROVIDER_ID
          ? getCoreSelectedModel(db, workspaceTarget)
          : null;

      return {
        backend: 'opencode',
        provider: 'local',
        model,
        effectiveModel:
          opencodeRuntimeController.runtimeModelFor(workspaceTarget) ??
          model ??
          getLastResolvedOpencodeModel(cwd) ??
          '(OpenCode default)',
        workspaceTarget,
      };
    },

    getEffectiveModel(props): string {
      const workspaceTarget = props.workspaceTarget ?? getWorkspaceTarget(db);
      const cwd = workspaceTarget === 'appweaver' ? dmBotRoot : parentOfBotRoot;

      return (
        props.model ??
        opencodeRuntimeController.runtimeModelFor(workspaceTarget) ??
        (getActiveModelSourceProviderId(db, workspaceTarget) ===
        CORE_MODEL_SOURCE_PROVIDER_ID
          ? getCoreSelectedModel(db, workspaceTarget)
          : null) ??
        getLastResolvedOpencodeModel(cwd) ??
        '(OpenCode default)'
      );
    },

    async getAvailableModels(): Promise<string[]> {
      return (
        await modelSources.listModels(getWorkspaceTarget(db), 'opencode')
      ).map((model) => model.id);
    },

    async run(props: PluginAgentRunProps): Promise<PluginAgentRunResult> {
      const requestedCwd = props.cwd ? resolve(props.cwd) : null;

      const workspaceTarget =
        props.workspaceTarget ??
        (requestedCwd === resolve(dmBotRoot)
          ? 'appweaver'
          : requestedCwd === resolve(parentOfBotRoot)
            ? 'parent'
            : getWorkspaceTarget(db));

      const cwd = workspaceTarget === 'appweaver' ? dmBotRoot : parentOfBotRoot;

      if (requestedCwd && requestedCwd !== resolve(cwd)) {
        throw new Error('Plugin agent cwd must match its managed workspace.');
      }

      return opencodeRuntimeController.withPreparedRun({
        prepare: () => prepared(workspaceTarget),
        run: async (run) => {
          const backend: AgentBackend = createBackend({
            backendName: 'opencode',
            dmBotRoot: cwd,
          });

          const reusableSessionId = props.sessionId;

          const sessionId =
            reusableSessionId ?? (await backend.createSession(cwd));

          if (reusableSessionId === null) {
            registerSession({
              db,
              sessionId,
            });
          }

          const contextOptions = props.context;

          const result = await backend.runMessage({
            sessionId,
            content: props.prompt,
            cwd,
            context:
              contextOptions === null
                ? null
                : {
                    runtimeContext: contextOptions.runtimeContext
                      ? buildActiveRuntimeContext({
                          backendName: 'opencode',
                          dmBotRoot,
                          cwd,
                        })
                      : null,
                    workspaceInstructions: contextOptions.workspaceInstructions
                      ? getWorkspaceInstructions(db, workspaceTarget)
                          .instructions
                      : null,
                    agentsInstructions: contextOptions.agentsInstructions
                      ? readAgentsInstructions({
                          workspaceTarget,
                          dmBotRoot,
                          parentOfBotRoot,
                        })
                      : null,
                    extraInstructions: contextOptions.extraInstructions,
                  },
            modelOverride: run.runtimeModelId,
            onAgentStreamChunk: props.onAgentStreamChunk,
            streamAbortSignal: props.abortSignal,
          });

          if (result.type === 'success') {
            await modelSources.recordSuccessfulUse(
              workspaceTarget,
              'opencode',
              run.modelId,
              run.providerId,
            );
          }

          return { ...result, backend: 'opencode' };
        },
      });
    },
  };
}
