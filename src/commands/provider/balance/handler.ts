import type { CoreDb } from '@src/db';
import { getRoutstrBudget, setRoutstrBudget } from '@src/db';
import { getRoutstrBalance } from '@src/providers/routstr';
import { msatsRaw } from '@src/types';

import type { ProviderBalanceRepresentation } from './representation';

export async function runProviderBalance(
  seenDb: CoreDb,
): Promise<ProviderBalanceRepresentation> {
  const balance = await getRoutstrBalance(seenDb);
  const currentBudget = getRoutstrBudget(seenDb);
  const changed = msatsRaw(currentBudget) !== msatsRaw(balance);

  if (changed) {
    setRoutstrBudget(seenDb, balance);
  }

  return {
    kind: 'provider.balance',
    version: 1,
    meta: { command: 'provider', subcommand: 'balance' },
    data: {
      balanceMsatsRaw: msatsRaw(balance),
      budgetWasUpdated: changed,
    },
  };
}
