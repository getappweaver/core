import type { RouteCommandContext } from '@src/commands/dispatch';
import {
  countRoutstrModelProviderRows,
  countRoutstrProviders,
  countRoutstrUniqueModels,
  getNewestRoutstrModelFetchMs,
} from '@src/db';
import {
  ROUTSTR_MODEL_INDEX_TTL_MS,
  syncRoutstrModelIndex,
} from '@src/providers/routstr-models';

import type { ProviderSyncModelsRepresentation } from './representation';

function toRepresentation(
  data: ProviderSyncModelsRepresentation['data'],
): ProviderSyncModelsRepresentation {
  return {
    kind: 'provider.sync-models',
    version: 1,
    meta: { command: 'provider', subcommand: 'sync-models' },
    data,
  };
}

export async function runProviderSyncModels(
  ctx: RouteCommandContext,
): Promise<ProviderSyncModelsRepresentation> {
  const updatedAtMs = getNewestRoutstrModelFetchMs(ctx.seenDb);

  if (updatedAtMs && Date.now() - updatedAtMs <= ROUTSTR_MODEL_INDEX_TTL_MS) {
    return toRepresentation({
      view: 'cached',
      providerCount: countRoutstrProviders(ctx.seenDb),
      modelProviderRows: countRoutstrModelProviderRows(ctx.seenDb),
      uniqueModels: countRoutstrUniqueModels(ctx.seenDb),
      updatedAtMs,
    });
  }

  const result = await syncRoutstrModelIndex({
    db: ctx.seenDb,
    pool: ctx.pool,
  });

  return toRepresentation({ view: 'fetched', ...result });
}
