import type { RouteCommandContext } from '@src/commands/dispatch';
import {
  getNewestRoutstrModelFetchMs,
  listRoutstrModelProviders,
  listRoutstrUniqueModels,
} from '@src/db';
import { ROUTSTR_MODEL_INDEX_TTL_MS } from '@src/providers/routstr-models';

import type { ProviderModelsRepresentation } from './representation';

type RunProviderModelsProps = {
  ctx: RouteCommandContext;
  filter: string | undefined;
};

function toRepresentation(
  data: ProviderModelsRepresentation['data'],
): ProviderModelsRepresentation {
  return {
    kind: 'provider.models',
    version: 1,
    meta: { command: 'provider', subcommand: 'models' },
    data,
  };
}

export async function runProviderModels(
  props: RunProviderModelsProps,
): Promise<ProviderModelsRepresentation> {
  const { ctx, filter } = props;
  const needle = filter?.trim() ?? '';
  const newestFetchedAtMs = getNewestRoutstrModelFetchMs(ctx.seenDb);

  const isFresh =
    newestFetchedAtMs !== null &&
    Date.now() - newestFetchedAtMs <= ROUTSTR_MODEL_INDEX_TTL_MS;

  if (needle !== '') {
    const exactProviders = listRoutstrModelProviders({
      db: ctx.seenDb,
      modelId: needle,
      minFetchedAtMs: isFresh ? Date.now() - ROUTSTR_MODEL_INDEX_TTL_MS : null,
    });

    if (exactProviders.length > 0) {
      return toRepresentation({
        view: 'model-providers',
        modelId: needle,
        newestFetchedAtMs: Math.max(
          ...exactProviders.map((p) => p.fetchedAtMs),
        ),
        providers: exactProviders.map((p) => ({
          providerKey: p.providerKey,
          providerPubkey: p.providerPubkey,
          providerD: p.providerD,
          endpointUrl: p.endpointUrl,
          modelName: p.modelName,
          contextLength: p.contextLength,
          inputPrice: p.inputPrice,
          outputPrice: p.outputPrice,
          requestPrice: p.requestPrice,
          fetchedAtMs: p.fetchedAtMs,
        })),
      });
    }
  }

  const items = listRoutstrUniqueModels({
    db: ctx.seenDb,
    filter: needle === '' ? null : needle,
    minFetchedAtMs: isFresh ? Date.now() - ROUTSTR_MODEL_INDEX_TTL_MS : null,
    limit: 200,
  });

  if (items.length === 0) {
    if (needle === '') {
      return toRepresentation({ view: 'empty-no-cache' });
    }

    return toRepresentation({
      view: 'empty-filter',
      filter: needle,
    });
  }

  return toRepresentation({
    view: 'list',
    filter: needle,
    newestFetchedAtMs: Math.max(...items.map((item) => item.newestFetchedAtMs)),
    items: items.map((item) => ({
      id: item.modelId,
      providerCount: item.providerCount,
      cheapestInputPrice: item.cheapestInputPrice,
      cheapestOutputPrice: item.cheapestOutputPrice,
      cheapestRequestPrice: item.cheapestRequestPrice,
      newestFetchedAtMs: item.newestFetchedAtMs,
    })),
  });
}
