import type { CoreDb } from '@src/db';
import {
  getProviderName,
  getRoutstrBudget,
  getRoutstrModel,
  getRoutstrSkKey,
} from '@src/db';
import { msatsRaw } from '@src/types';

import type { ProviderStatusRepresentation } from './representation';

type RunProviderStatusProps = {
  seenDb: CoreDb;
  mintUrl: string | null;
  prefix: string;
};

function toRepresentation(
  data: ProviderStatusRepresentation['data'],
): ProviderStatusRepresentation {
  return {
    kind: 'provider.status',
    version: 1,
    meta: { command: 'provider', subcommand: 'status' },
    data,
  };
}

export function runProviderStatus(
  props: RunProviderStatusProps,
): ProviderStatusRepresentation {
  const { seenDb, mintUrl, prefix } = props;

  if (!mintUrl) {
    return toRepresentation({ view: 'no-mint', prefix });
  }

  const name = getProviderName(seenDb);

  if (name !== 'routstr') {
    return toRepresentation({ view: 'local' });
  }

  const skKey = getRoutstrSkKey(seenDb);
  const model = getRoutstrModel(seenDb);
  const budgetMsats = getRoutstrBudget(seenDb);

  return toRepresentation({
    view: 'routstr',
    sessionKeyShort: skKey ? skKey.slice(0, 6) : null,
    mintUrl,
    budgetMsatsRaw: msatsRaw(budgetMsats),
    modelId: model,
  });
}
