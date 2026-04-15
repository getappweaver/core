import type { CoreDb } from '@src/db';
import { getCachedRoutstrModels, setCachedRoutstrModels } from '@src/db';
import { fetchRoutstrModels } from '@src/providers/routstr-models';

import type { ProviderModelsRepresentation } from './representation';

type RunProviderModelsProps = {
  seenDb: CoreDb;
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
  const { seenDb, filter } = props;

  let result = getCachedRoutstrModels(seenDb);

  if (!result) {
    const models = await fetchRoutstrModels();

    setCachedRoutstrModels(seenDb, models);
    result = { models, ts: Date.now() };
  }

  const { models, ts } = result;
  const needle = filter?.trim().toLowerCase() ?? '';

  const filtered =
    needle === ''
      ? models
      : models.filter(
          (m) =>
            m.id.toLowerCase().includes(needle) ||
            (m.name?.toLowerCase().includes(needle) ?? false),
        );

  if (filtered.length === 0) {
    if (needle === '') {
      return toRepresentation({ view: 'empty-no-cache' });
    }

    return toRepresentation({
      view: 'empty-filter',
      filter: filter?.trim() ?? needle,
    });
  }

  return toRepresentation({
    view: 'list',
    filter: filter?.trim() ?? '',
    updatedAtMs: ts,
    items: filtered.map((m) => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length ?? null,
    })),
  });
}
