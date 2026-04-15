import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'path';

import type { CoreDb } from '@src/db';
import { getCachedRoutstrModels, setCachedRoutstrModels } from '@src/db';
import {
  buildOpenCodeModelEntry,
  fetchRoutstrModels,
} from '@src/providers/routstr-models';

import type { RouteCommandContext } from '../../dispatch';

import type { ProviderAddModelRepresentation } from './representation';

type RunProviderAddModelProps = {
  ctx: RouteCommandContext;
  modelId: string | undefined;
};

function toRepresentation(
  data: ProviderAddModelRepresentation['data'],
): ProviderAddModelRepresentation {
  return {
    kind: 'provider.add-model',
    version: 1,
    meta: { command: 'provider', subcommand: 'add-model' },
    data,
  };
}

async function ensureModelsCache(seenDb: CoreDb) {
  let result = getCachedRoutstrModels(seenDb);

  if (!result) {
    const models = await fetchRoutstrModels();

    setCachedRoutstrModels(seenDb, models);
    result = { models, ts: Date.now() };
  }

  return result;
}

export async function runProviderAddModel(
  props: RunProviderAddModelProps,
): Promise<ProviderAddModelRepresentation> {
  const { ctx, modelId } = props;
  const p = ctx.prefix;

  if (!modelId) {
    return toRepresentation({ view: 'usage', prefix: p });
  }

  const result = await ensureModelsCache(ctx.seenDb);
  const model = result.models.find((m) => m.id === modelId);

  if (!model) {
    return toRepresentation({ view: 'not-found', modelId });
  }

  const openCodeJsonPath = join(ctx.dmBotRoot, 'opencode.json');
  const raw = await readFile(openCodeJsonPath, 'utf-8');
  const config = JSON.parse(raw) as Record<string, unknown>;

  if (typeof config.provider !== 'object' || config.provider === null) {
    config.provider = {};
  }

  const provider = config.provider as Record<string, unknown>;

  if (typeof provider.routstr !== 'object' || provider.routstr === null) {
    provider.routstr = {};
  }

  const routstr = provider.routstr as Record<string, unknown>;

  if (typeof routstr.models !== 'object' || routstr.models === null) {
    routstr.models = {};
  }

  const modelsObj = routstr.models as Record<string, unknown>;
  const entry = buildOpenCodeModelEntry(model);
  const isUpdate = modelId in modelsObj;

  modelsObj[modelId] = entry;

  await writeFile(
    openCodeJsonPath,
    JSON.stringify(config, null, 2) + '\n',
    'utf-8',
  );

  return toRepresentation({
    view: 'success',
    modelId,
    isUpdate,
    entryPrettyJson: JSON.stringify(entry, null, 2),
  });
}
