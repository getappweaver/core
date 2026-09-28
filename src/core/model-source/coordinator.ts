import { opencodeRuntimeController } from '@src/backends/opencode-runtime-controller';
import { withOpencodeSource } from '@src/backends/opencode-sdk';
import type {
  AiModelSourceContextUsage,
  AiModelRuntimeConfig,
  AiModelSourceModel,
  AiModelSourceState,
} from '@src/capabilities/ai-model-source.v1';
import { AiModelSourceV1 } from '@src/capabilities/ai-model-source.v1';
import type { CapabilityClient } from '@src/capabilities/types';
import {
  getActiveModelSourceProviderId,
  setActiveModelSourceProviderId,
  type AgentBackendName,
  type CoreDb,
  type WorkspaceTarget,
} from '@src/db';

export type ModelSourceSnapshot = {
  providerId: string;
  state: AiModelSourceState;
  models: AiModelSourceModel[];
};

export type ModelSourceOption = {
  providerId: string;
  alias: string;
  title: string;
  active: boolean;
  health: AiModelSourceState['health'];
};

export type PreparedModelRun = {
  providerId: string;
  modelId: string;
  runtimeModelId: string;
  runtimeConfig: AiModelRuntimeConfig;
};

type GetContextUsageProps = {
  workspaceTarget: WorkspaceTarget;
  backend: AgentBackendName;
  providerId: string;
  sessionId: string;
  modelId: string;
};

export class ModelSourceCoordinator {
  constructor(
    private readonly db: CoreDb,
    private readonly client: CapabilityClient,
  ) {}

  private provider(workspaceTarget: WorkspaceTarget): string {
    return getActiveModelSourceProviderId(this.db, workspaceTarget);
  }

  async listSources(
    workspaceTarget: WorkspaceTarget,
    activeSnapshot: ModelSourceSnapshot | null,
  ): Promise<ModelSourceOption[]> {
    const activeId = this.provider(workspaceTarget);
    const providers = this.client.listProviders(AiModelSourceV1.capability);

    return Promise.all(
      providers.map(async (provider) => {
        const alias = provider.source.alias;

        try {
          const output =
            activeSnapshot?.providerId === provider.providerId
              ? { state: activeSnapshot.state }
              : ((await this.invoke(
                  AiModelSourceV1.operations['get-state'],
                  provider.providerId,
                  { workspaceTarget, backend: 'opencode' },
                )) as { state: AiModelSourceState });

          return {
            providerId: provider.providerId,
            alias,
            title: output.state.title,
            active: activeId === provider.providerId,
            health: output.state.health,
          };
        } catch {
          return {
            providerId: provider.providerId,
            alias,
            title: provider.source.title,
            active: activeId === provider.providerId,
            health: {
              status: 'unavailable' as const,
              message: 'Model source status unavailable.',
            },
          };
        }
      }),
    );
  }

  resolveSourceId(value: string): string {
    const candidates = this.client.listProviders(AiModelSourceV1.capability);

    const matching = candidates.filter(
      (provider) =>
        provider.providerId === value || provider.source.alias === value,
    );

    if (matching.length !== 1) {
      throw new Error('Unknown or ambiguous model source.');
    }

    return matching[0].providerId;
  }

  private async invoke<
    TOperation extends
      (typeof AiModelSourceV1.operations)[keyof typeof AiModelSourceV1.operations],
  >(
    operation: TOperation,
    provider: string,
    input: Parameters<CapabilityClient['invoke']>[0]['input'],
  ) {
    const result = await this.client.invoke({
      operation,
      provider,
      input,
    } as never);

    if (result.status !== 'success') {
      throw new Error(`Model source provider is unavailable: ${provider}`);
    }

    return result.output as any;
  }

  async setActiveSource(
    workspaceTarget: WorkspaceTarget,
    providerId: string,
  ): Promise<ModelSourceSnapshot> {
    const providers = this.client.listProviders(AiModelSourceV1.capability);
    const previousId = this.provider(workspaceTarget);

    if (!providers.some((provider) => provider.providerId === providerId)) {
      throw new Error(`Unknown model source provider: ${providerId}`);
    }

    let state = (await this.invoke(
      AiModelSourceV1.operations['get-state'],
      providerId,
      { workspaceTarget, backend: 'opencode' },
    )) as { state: AiModelSourceState };

    if (!state.state.active) {
      state = (await this.invoke(
        AiModelSourceV1.operations.activate,
        providerId,
        { workspaceTarget, backend: 'opencode' },
      )) as { state: AiModelSourceState };

      if (!state.state.active) {
        throw new Error('The model source could not be activated.');
      }
    }

    try {
      await this.invoke(
        AiModelSourceV1.operations['get-runtime-config'],
        providerId,
        {
          workspaceTarget,
          backend: 'opencode',
          modelId: state.state.effectiveModelId,
        },
      );

      setActiveModelSourceProviderId(this.db, workspaceTarget, providerId);

      const snapshot = await this.getSnapshot(workspaceTarget, 'opencode');

      return snapshot;
    } catch (error) {
      setActiveModelSourceProviderId(this.db, workspaceTarget, previousId);

      throw error;
    }
  }

  async getSnapshot(
    workspaceTarget: WorkspaceTarget,
    backend: AgentBackendName,
    sourceId?: string,
  ): Promise<ModelSourceSnapshot> {
    const providerId = sourceId
      ? this.resolveSourceId(sourceId)
      : this.provider(workspaceTarget);

    const output = (await this.invoke(
      AiModelSourceV1.operations['list-models'],
      providerId,
      { workspaceTarget, backend },
    )) as { state: AiModelSourceState; models: AiModelSourceModel[] };

    return { providerId, ...output };
  }

  async listModels(
    workspaceTarget: WorkspaceTarget,
    backend: AgentBackendName,
  ): Promise<AiModelSourceModel[]> {
    return (await this.getSnapshot(workspaceTarget, backend)).models;
  }

  async getContextUsage(
    props: GetContextUsageProps,
  ): Promise<AiModelSourceContextUsage | null> {
    const runtime = (await this.invoke(
      AiModelSourceV1.operations['get-runtime-config'],
      props.providerId,
      {
        workspaceTarget: props.workspaceTarget,
        backend: props.backend,
        modelId: props.modelId,
      },
    )) as { config: AiModelRuntimeConfig };

    const output = (await withOpencodeSource({
      workspaceRoot: opencodeRuntimeController.workspaceRoot(
        props.workspaceTarget,
      ),
      providerId: props.providerId,
      config: runtime.config,
      run: () =>
        this.invoke(
          AiModelSourceV1.operations['get-context-usage'],
          props.providerId,
          {
            workspaceTarget: props.workspaceTarget,
            backend: props.backend,
            sessionId: props.sessionId,
            modelId: props.modelId,
          },
        ),
    })) as { usage: AiModelSourceContextUsage | null };

    return output.usage;
  }

  async selectModel(
    workspaceTarget: WorkspaceTarget,
    backend: AgentBackendName,
    modelId: string | null,
  ): Promise<AiModelSourceState> {
    const providerId = this.provider(workspaceTarget);

    const output = (await this.invoke(
      AiModelSourceV1.operations['select-model'],
      providerId,
      { workspaceTarget, backend, modelId },
    )) as { state: AiModelSourceState };

    return output.state;
  }

  async setFavorite(
    workspaceTarget: WorkspaceTarget,
    backend: AgentBackendName,
    modelId: string,
    favorite: boolean,
  ): Promise<ModelSourceSnapshot> {
    const providerId = this.provider(workspaceTarget);

    const output = (await this.invoke(
      AiModelSourceV1.operations['set-favorite'],
      providerId,
      { workspaceTarget, backend, modelId, favorite },
    )) as { state: AiModelSourceState; models: AiModelSourceModel[] };

    return { providerId, ...output };
  }

  async prepareRun(
    workspaceTarget: WorkspaceTarget,
    backend: AgentBackendName,
    selection?: { providerId?: string | null; modelId?: string | null },
  ): Promise<PreparedModelRun> {
    const providerId = selection?.providerId ?? this.provider(workspaceTarget);

    if (
      !this.client
        .listProviders(AiModelSourceV1.capability)
        .some((p) => p.providerId === providerId)
    ) {
      throw new Error(`Unknown model source provider: ${providerId}`);
    }

    let stateOutput = (await this.invoke(
      AiModelSourceV1.operations['get-state'],
      providerId,
      { workspaceTarget, backend },
    )) as { state: AiModelSourceState };

    if (!stateOutput.state.active) {
      stateOutput = (await this.invoke(
        AiModelSourceV1.operations.activate,
        providerId,
        {
          workspaceTarget,
          backend,
        },
      )) as { state: AiModelSourceState };
    }

    const modelId = selection?.modelId ?? stateOutput.state.effectiveModelId;

    const preflight = (await this.invoke(
      AiModelSourceV1.operations.preflight,
      providerId,
      { workspaceTarget, backend, modelId },
    )) as { ready: boolean; reason?: string };

    if (!preflight.ready) {
      throw new Error(
        preflight.reason ?? 'The active model source is not ready.',
      );
    }

    const runtime = (await this.invoke(
      AiModelSourceV1.operations['get-runtime-config'],
      providerId,
      { workspaceTarget, backend, modelId },
    )) as { config: AiModelRuntimeConfig };

    const runtimeModelId =
      runtime.config.kind === 'canonical-model'
        ? modelId
        : `${runtime.config.provider.id}/${modelId}`;

    return {
      providerId,
      modelId,
      runtimeModelId,
      runtimeConfig: runtime.config,
    };
  }

  async recordSuccessfulUse(
    workspaceTarget: WorkspaceTarget,
    backend: AgentBackendName,
    modelId: string,
    providerId: string,
  ): Promise<void> {
    await this.invoke(AiModelSourceV1.operations['record-use'], providerId, {
      workspaceTarget,
      backend,
      modelId,
      usedAt: new Date().toISOString(),
    });
  }
}
