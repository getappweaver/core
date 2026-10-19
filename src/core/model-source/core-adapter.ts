import { opencodeRuntimeController } from '@src/backends/opencode-runtime-controller';
import {
  getOpencodeSdkContextStats,
  getOpencodeSdkGeneration,
  getOpencodeWorkspaceModels,
} from '@src/backends/opencode-sdk';
import type {
  AiModelSourceModel,
  AiModelSourceState,
  AiModelSourceContextUsage,
} from '@src/capabilities/ai-model-source.v1';
import {
  CORE_MODEL_SOURCE_PROVIDER_ID,
  getCoreSelectedModel,
  listFavoriteModelIds,
  listRecentModels,
  recordRecentModelUse,
  setModelFavorite,
  setCoreSelectedModel,
  type AgentBackendName,
  type CoreDb,
  type WorkspaceTarget,
} from '@src/db';

type CoreModelSourceAdapterProps = {
  db: CoreDb;
  dmBotRoot: string;
  parentOfBotRoot: string;
};

type SourceContext = {
  workspaceTarget: WorkspaceTarget;
  backend: AgentBackendName;
};

type ContextUsageRequest = SourceContext & {
  sessionId: string;
  modelId: string;
};

type CoreCatalog = Awaited<ReturnType<typeof getOpencodeWorkspaceModels>>;

type CatalogCacheEntry = {
  fetchedAt: number;
  sdkGeneration: number;
  value: Promise<CoreCatalog>;
  refreshing?: Promise<CoreCatalog | void>;
};

const CATALOG_FRESH_MS = 60_000;
const CATALOG_MAX_AGE_MS = 600_000;

function hashRevision(values: string[]): string {
  let hash = 2_166_136_261;

  for (const char of values.join('\u0000')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36);
}

export class CoreModelSourceAdapter {
  private readonly catalogs = new Map<WorkspaceTarget, CatalogCacheEntry>();

  constructor(private readonly props: CoreModelSourceAdapterProps) {}

  private cwd(workspaceTarget: WorkspaceTarget): string {
    return workspaceTarget === 'appweaver'
      ? this.props.dmBotRoot
      : this.props.parentOfBotRoot;
  }

  private fetchCatalog(workspaceTarget: WorkspaceTarget): Promise<CoreCatalog> {
    const value = opencodeRuntimeController
      .withAdmission(() =>
        getOpencodeWorkspaceModels(this.cwd(workspaceTarget)),
      )
      .catch((error) => {
        if (this.catalogs.get(workspaceTarget)?.value === value) {
          this.catalogs.delete(workspaceTarget);
        }

        throw error;
      });

    return value;
  }

  private async catalog(context: SourceContext) {
    const currentGeneration = getOpencodeSdkGeneration();
    const cached = this.catalogs.get(context.workspaceTarget);
    const now = Date.now();

    if (cached && cached.sdkGeneration === currentGeneration) {
      const age = now - cached.fetchedAt;

      if (age < CATALOG_FRESH_MS) {
        return cached.value;
      }

      if (age < CATALOG_MAX_AGE_MS) {
        if (!cached.refreshing) {
          const refreshPromise = this.fetchCatalog(context.workspaceTarget)
            .then((freshCatalog) => {
              this.catalogs.set(context.workspaceTarget, {
                fetchedAt: Date.now(),
                sdkGeneration: currentGeneration,
                value: Promise.resolve(freshCatalog),
              });

              return freshCatalog;
            })
            .catch(() => {
              const current = this.catalogs.get(context.workspaceTarget);

              if (current && current.refreshing === refreshPromise) {
                delete current.refreshing;
              }
            });

          cached.refreshing = refreshPromise;
        }

        return cached.value;
      }
    }

    const value = this.fetchCatalog(context.workspaceTarget);

    this.catalogs.set(context.workspaceTarget, {
      fetchedAt: now,
      sdkGeneration: currentGeneration,
      value,
    });

    return value;
  }

  private effective(
    context: SourceContext,
    catalog: Awaited<ReturnType<CoreModelSourceAdapter['catalog']>>,
  ): {
    selectedModelId: string | null;
    effectiveModelId: string;
    fallbackReason: AiModelSourceState['fallbackReason'];
  } {
    const selectedModelId = getCoreSelectedModel(
      this.props.db,
      context.workspaceTarget,
    );

    if (selectedModelId) {
      return {
        selectedModelId,
        effectiveModelId: selectedModelId,
        fallbackReason: 'selected',
      };
    }

    if (catalog.configuredModel) {
      return {
        selectedModelId: null,
        effectiveModelId: catalog.configuredModel,
        fallbackReason: 'root',
      };
    }

    if (!catalog.defaultModel) {
      throw new Error('OpenCode did not report an available default model.');
    }

    return {
      selectedModelId: null,
      effectiveModelId: catalog.defaultModel,
      fallbackReason: 'backend-default',
    };
  }

  private models(context: SourceContext, ids: string[]): AiModelSourceModel[] {
    const favorites = listFavoriteModelIds(
      this.props.db,
      context.workspaceTarget,
      CORE_MODEL_SOURCE_PROVIDER_ID,
    );

    const recents = listRecentModels(
      this.props.db,
      context.workspaceTarget,
      CORE_MODEL_SOURCE_PROVIDER_ID,
    );

    return ids.map((id) => ({
      id,
      label: id,
      description: null,
      group: id.includes('/') ? id.slice(0, id.indexOf('/')) : context.backend,
      contextWindowTokens: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
      features: [],
      privacy: null,
      price: null,
      favorite: favorites.has(id),
      lastUsedAt: recents.has(id)
        ? new Date(recents.get(id)!).toISOString()
        : null,
      availability: { status: 'available' as const },
    }));
  }

  async getSnapshot(context: SourceContext): Promise<{
    state: AiModelSourceState;
    models: AiModelSourceModel[];
  }> {
    const catalog = await this.catalog(context);
    const models = this.models(context, catalog.models);
    const effective = this.effective(context, catalog);

    return {
      models,
      state: {
        sourceId: CORE_MODEL_SOURCE_PROVIDER_ID,
        title: 'Core models',
        active: true,
        transitionState: 'stable',
        health: { status: 'healthy' },
        ...effective,
        catalogRevision: hashRevision(
          models.flatMap((model) => [
            model.id,
            String(model.favorite),
            model.lastUsedAt ?? '',
            model.availability.status,
          ]),
        ),
      },
    };
  }

  async getState(context: SourceContext): Promise<AiModelSourceState> {
    return (await this.getSnapshot(context)).state;
  }

  async listModels(context: SourceContext): Promise<AiModelSourceModel[]> {
    return (await this.getSnapshot(context)).models;
  }

  async getContextUsage(
    request: ContextUsageRequest,
  ): Promise<AiModelSourceContextUsage | null> {
    return getOpencodeSdkContextStats({
      sessionId: request.sessionId,
      cwd: this.cwd(request.workspaceTarget),
      effectiveModel: request.modelId,
      estimateWhenMissing: false,
    });
  }

  async selectModel(
    context: SourceContext,
    modelId: string | null,
  ): Promise<AiModelSourceState> {
    const catalog = await this.catalog(context);

    if (modelId !== null) {
      const model = this.models(context, catalog.models).find(
        (entry) => entry.id === modelId,
      );

      if (!model || model.availability.status !== 'available') {
        throw new Error(
          `Model is unavailable from the active source: ${modelId}`,
        );
      }
    }

    setCoreSelectedModel(this.props.db, context.workspaceTarget, modelId);

    return (await this.getSnapshot(context)).state;
  }

  async setFavorite(
    context: SourceContext,
    modelId: string,
    favorite: boolean,
  ): Promise<void> {
    if (
      !(await this.listModels(context)).some((model) => model.id === modelId)
    ) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    setModelFavorite({
      db: this.props.db,
      workspaceTarget: context.workspaceTarget,
      providerId: CORE_MODEL_SOURCE_PROVIDER_ID,
      modelId,
      favorite,
    });
  }

  recordUse(context: SourceContext, modelId: string, usedAt: string): void {
    recordRecentModelUse({
      db: this.props.db,
      workspaceTarget: context.workspaceTarget,
      providerId: CORE_MODEL_SOURCE_PROVIDER_ID,
      modelId,
      usedAt: new Date(usedAt).getTime(),
    });
  }
}
