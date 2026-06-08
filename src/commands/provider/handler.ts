// ---------------------------------------------------------------------------
// src/commands/provider/handler.ts — Routstr provider operations
// ---------------------------------------------------------------------------

import { getProviderName, getRoutstrBudget } from '@src/db';
import { msatsRaw } from '@src/types';
import type { WebHandlerResult } from '@src/web/ui-schema';

import type { RouteCommandContext } from '../dispatch';
import { handleError } from '../dispatch';

import { runProviderAddModel } from './add-model/handler';
import { runProviderBalance } from './balance/handler';
import { runProviderBudget } from './budget/handler';
import { renderProviderCli } from './cli-representation';
import { runProviderDeposit } from './deposit/handler';
import { runProviderModels } from './models/handler';
import { runProviderRefund } from './refund/handler';
import { runProviderStatus } from './status/handler';
import { renderProviderStatusWeb } from './status/renderers/web';
import { runProviderSyncModels } from './sync-models/handler';
import {
  buildProviderCommandsOnlyUsage,
  buildProviderIndexRepresentation,
} from './usage/representation';

/**
 * Routstr subcommands after `routstr` (args[0] = deposit|balance|…).
 */
export async function runRoutstrCommandsFromArgs(
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
      return handleError(async () => {
        const rep = await runProviderStatus({
          ctx: input,
        });

        return input.source === 'web'
          ? renderProviderStatusWeb(rep)
          : render(rep);
      }, 'Failed to get status');
    }

    case 'models':
      return handleError(
        async () =>
          render(
            await runProviderModels({
              ctx: input,
              filter: args[1],
            }),
          ),
        'Failed to list models',
      );

    case 'sync-models':
      return handleError(
        async () => render(await runProviderSyncModels(input)),
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
