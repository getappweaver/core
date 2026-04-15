import type { CoreDb } from '@src/db';
import { getRoutstrBudget, setRoutstrBudget } from '@src/db';
import { msats, msatsRaw } from '@src/types';

import type { ProviderBudgetRepresentation } from './representation';

type RunProviderBudgetProps = {
  seenDb: CoreDb;
  budgetArg: string | undefined;
  prefix: string;
};

function toRepresentation(
  data: ProviderBudgetRepresentation['data'],
): ProviderBudgetRepresentation {
  return {
    kind: 'provider.budget',
    version: 1,
    meta: { command: 'provider', subcommand: 'budget' },
    data,
  };
}

export function runProviderBudget(
  props: RunProviderBudgetProps,
): ProviderBudgetRepresentation {
  const { seenDb, budgetArg, prefix } = props;
  const budgetMsats = parseInt(budgetArg ?? '', 10);

  if (isNaN(budgetMsats) || budgetMsats <= 0) {
    return toRepresentation({
      view: 'usage',
      prefix,
      currentBudgetMsatsRaw: msatsRaw(getRoutstrBudget(seenDb)),
    });
  }

  const m = msats(budgetMsats);

  setRoutstrBudget(seenDb, m);

  return toRepresentation({
    view: 'set',
    budgetMsatsRaw: msatsRaw(m),
  });
}
