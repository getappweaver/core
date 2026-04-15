import type { CoreDb } from '@src/db';
import { getCachedRoutstrModels, setCachedRoutstrModels } from '@src/db';
import { fetchRoutstrModels } from '@src/providers/routstr-models';

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
  db: CoreDb,
): Promise<ProviderSyncModelsRepresentation> {
  const result = getCachedRoutstrModels(db);

  if (!result) {
    const models = await fetchRoutstrModels();

    setCachedRoutstrModels(db, models);

    return toRepresentation({ view: 'fetched' });
  }

  const { models, ts } = result;

  return toRepresentation({
    view: 'cached',
    count: models.length,
    updatedAtMs: ts,
  });
}
