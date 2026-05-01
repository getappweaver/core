// ---------------------------------------------------------------------------
// src/commands/provider/handler.ts — Routstr / provider (invoked from ai)
// ---------------------------------------------------------------------------

import {
  getProviderName,
  getRoutstrBudget,
  getWalletDefaultMintUrl,
} from '@src/db';
import { msatsRaw } from '@src/types';
import type { WebHandlerResult } from '@src/web/ui-schema';

import type { RouteCommandContext } from '../dispatch';
import { handleError } from '../dispatch';
import { appendStatusBlock } from '../shared/with-status';

import { runProviderAddModel } from './add-model/handler';
import { runProviderBalance } from './balance/handler';
import { runProviderBudget } from './budget/handler';
import { renderProviderCli } from './cli-representation';
import { runProviderDeposit } from './deposit/handler';
import { runProviderModels } from './models/handler';
import { runProviderRefund } from './refund/handler';
import { handleProviderSet } from './set/handler';
import { runProviderStatus } from './status/handler';
import { runProviderSyncModels } from './sync-models/handler';
import {
  buildProviderCommandsOnlyUsage,
  buildProviderIndexRepresentation,
} from './usage/representation';

/**
 * Provider subcommands after `ai provider` (args[0] = set|deposit|…).
 */
export async function runProviderCommandsFromArgs(
  input: RouteCommandContext,
  args: string[],
): Promise<WebHandlerResult> {
  const p = input.prefix;
  const subcmd = args[0]?.toLowerCase();

  const render = (rep: Parameters<typeof renderProviderCli>[0]) =>
    renderProviderCli(rep, { prefix: p });

  if (!subcmd) {
    const name = getProviderName(input.seenDb);

    const rep = buildProviderIndexRepresentation({
      providerName: name,
      budgetMsatsRaw:
        name === 'routstr' ? msatsRaw(getRoutstrBudget(input.seenDb)) : null,
    });

    return render(rep);
  }

  switch (subcmd) {
    case 'set': {
      const rep = handleProviderSet({
        seenDb: input.seenDb,
        name: args[1]?.toLowerCase(),
        prefix: p,
      });

      return appendStatusBlock(input, render(rep));
    }

    case 'deposit':
      return handleError(
        async () => render(await runProviderDeposit({ ctx: input, args })),
        'Failed to deposit',
      );

    case 'refund':
      return handleError(
        async () => render(await runProviderRefund(input)),
        'Failed to refund',
      );

    case 'balance':
      return handleError(
        async () => render(await runProviderBalance(input.seenDb)),
        'Failed to get balance',
      );

    case 'budget':
      return handleError(
        async () =>
          render(
            runProviderBudget({
              seenDb: input.seenDb,
              budgetArg: args[1],
              prefix: p,
            }),
          ),
        'Failed to set budget',
      );

    case 'status': {
      const mintUrl = getWalletDefaultMintUrl(
        input.seenDb,
        input.config.cashuDefaultMintUrl,
      );

      return handleError(
        async () =>
          render(
            runProviderStatus({
              seenDb: input.seenDb,
              mintUrl,
              prefix: p,
            }),
          ),
        'Failed to get status',
      );
    }

    case 'models':
      return handleError(
        async () =>
          render(
            await runProviderModels({
              seenDb: input.seenDb,
              filter: args[1],
            }),
          ),
        'Failed to list models',
      );

    case 'sync-models':
      return handleError(
        async () => render(await runProviderSyncModels(input.seenDb)),
        'Failed to sync models',
      );

    case 'add-model':
      return handleError(
        async () =>
          render(
            await runProviderAddModel({
              ctx: input,
              modelId: args[1],
            }),
          ),
        'Failed to add model',
      );

    default:
      return render(buildProviderCommandsOnlyUsage({ prefix: p }));
  }
}
