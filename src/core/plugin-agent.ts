import { buildActiveRuntimeContext } from '@src/backends/agent-runtime-context';
import { createBackend } from '@src/backends/factory';
import { listOpencodeModelCatalog } from '@src/backends/opencode-config';
import type { AgentBackend } from '@src/backends/types';
import {
  getAgentBackend,
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getModelOverride,
  getProviderName,
  getRoutstrSkKey,
  getWorkspaceInstructions,
  getWorkspaceTarget,
  type AgentBackendName,
  type CoreDb,
} from '@src/db';

import { readAgentsInstructions } from './agent-instructions';
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

function sessionBackend(
  db: CoreDb,
  sessionId: string,
): AgentBackendName | null {
  const row = db
    .prepare('SELECT backend FROM sessions WHERE id = ?')
    .get(sessionId) as { backend: AgentBackendName } | undefined;

  return row?.backend ?? null;
}

function registerSession(props: {
  db: CoreDb;
  sessionId: string;
  backend: AgentBackendName;
}): void {
  props.db.run(
    'INSERT OR IGNORE INTO sessions (id, created_at, backend) VALUES (?, ?, ?)',
    [props.sessionId, Math.floor(Date.now() / 1000), props.backend],
  );
}

export function createPluginAgentService({
  db,
  dmBotRoot,
  parentOfBotRoot,
  attachUrl,
}: CreatePluginAgentServiceProps): PluginAgentService {
  function getEffectiveModel(props: {
    backend: AgentBackendName | null;
    model: string | null;
    mode: PluginAgentRunProps['mode'];
    workspaceTarget: PluginAgentRunProps['workspaceTarget'];
  }): string {
    const backend = props.backend ?? getAgentBackend(db);
    const provider = getProviderName(db);
    const mode = props.mode ?? getCurrentOrDefaultMode(db);
    const workspaceTarget = props.workspaceTarget ?? getWorkspaceTarget(db);

    const cwd = workspaceTarget === 'appweaver' ? dmBotRoot : parentOfBotRoot;

    const executionProfile = getBackendExecutionProfile(db, backend);

    return createBackend({
      backendName: backend,
      dmBotRoot: cwd,
      cursorMode: mode,
      opencodeAgentName:
        props.mode !== null
          ? props.mode
          : executionProfile.kind === 'opencode'
            ? executionProfile.agent
            : null,
      attachUrl,
      modelOverride: props.model ?? getModelOverride(db, backend),
      providerName: provider,
    }).modelName;
  }

  function getDefaults(): PluginAgentDefaults {
    const backend = getAgentBackend(db);
    const provider = getProviderName(db);
    const model = getModelOverride(db, backend);
    const mode = getCurrentOrDefaultMode(db);
    const workspaceTarget = getWorkspaceTarget(db);

    const effectiveModel = getEffectiveModel({
      backend,
      model,
      mode,
      workspaceTarget,
    });

    return {
      backend,
      provider,
      model,
      effectiveModel,
      mode,
      workspaceTarget,
    };
  }

  function createSelectedBackend(props: {
    backendName: AgentBackendName;
    provider: PluginAgentRunProps['provider'];
    model: PluginAgentRunProps['model'];
    mode: PluginAgentRunProps['mode'];
  }): AgentBackend {
    const defaults = getDefaults();
    const executionProfile = getBackendExecutionProfile(db, props.backendName);
    const mode = props.mode ?? defaults.mode;

    return createBackend({
      backendName: props.backendName,
      dmBotRoot,
      cursorMode: mode,
      opencodeAgentName:
        props.mode !== null
          ? props.mode
          : executionProfile.kind === 'opencode'
            ? executionProfile.agent
            : null,
      attachUrl,
      modelOverride: props.model ?? getModelOverride(db, props.backendName),
      providerName: props.provider ?? defaults.provider,
    });
  }

  return {
    getDefaults,
    getEffectiveModel,

    async getAvailableModels(props): Promise<string[]> {
      const backendName = props.backend ?? getAgentBackend(db);
      const workspaceTarget = getWorkspaceTarget(db);

      const cwd = workspaceTarget === 'appweaver' ? dmBotRoot : parentOfBotRoot;

      if (backendName === 'opencode') {
        return listOpencodeModelCatalog(cwd).map((choice) => choice.value);
      }

      return createSelectedBackend({
        backendName,
        provider: null,
        model: null,
        mode: null,
      }).availableModels();
    },

    async run(props): Promise<PluginAgentRunResult> {
      const storedBackend = props.sessionId
        ? sessionBackend(db, props.sessionId)
        : null;

      const backendName = props.backend ?? storedBackend ?? getAgentBackend(db);

      if (storedBackend !== null && storedBackend !== backendName) {
        throw new Error(
          `Agent session ${props.sessionId} belongs to ${storedBackend}, not ${backendName}`,
        );
      }

      const workspaceTarget = props.workspaceTarget ?? getWorkspaceTarget(db);

      const cwd =
        props.cwd ??
        (workspaceTarget === 'appweaver' ? dmBotRoot : parentOfBotRoot);

      const backend = createSelectedBackend({
        backendName,
        provider: props.provider,
        model: props.model,
        mode: props.mode,
      });

      const sessionId = props.sessionId ?? (await backend.createSession(cwd));

      if (storedBackend === null) {
        registerSession({ db, sessionId, backend: backendName });
      }

      const defaults = getDefaults();
      const executionProfile = getBackendExecutionProfile(db, backendName);
      const mode = props.mode ?? defaults.mode;

      const agentName =
        props.mode !== null
          ? props.mode
          : executionProfile.kind === 'opencode'
            ? executionProfile.agent
            : mode;

      const contextOptions = props.context;

      const result = await backend.runMessage({
        sessionId,
        content: props.prompt,
        cursorMode: mode,
        opencodeAgentName:
          props.mode !== null
            ? props.mode
            : executionProfile.kind === 'opencode'
              ? executionProfile.agent
              : null,
        cwd,
        context:
          contextOptions === null
            ? null
            : {
                runtimeContext: contextOptions.runtimeContext
                  ? buildActiveRuntimeContext({
                      backendName,
                      agentName,
                      dmBotRoot,
                      cwd,
                    })
                  : null,
                workspaceInstructions: contextOptions.workspaceInstructions
                  ? getWorkspaceInstructions(db, workspaceTarget).instructions
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
        getRoutstrSkKey: () => getRoutstrSkKey(db),
        modelOverride: props.model ?? getModelOverride(db, backendName),
        onAgentStreamChunk: props.onAgentStreamChunk,
        streamAbortSignal: props.abortSignal,
      });

      return { ...result, backend: backendName };
    },
  };
}
