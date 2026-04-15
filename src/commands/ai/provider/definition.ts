import { ProviderNameSchema } from '@src/db';
import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiProviderSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;
  const providerOpts = ProviderNameSchema.options.join('|');

  return {
    name: 'provider',
    summary: `Payment provider and Routstr (set, deposit, balance, …).`,
    aliases: [],
    arguments: [
      {
        name: 'subcommand',
        summary:
          'set, deposit, refund, balance, budget, status, models, sync-models, add-model',
        kind: 'string',
        required: false,
        variadic: true,
      },
    ],
    options: [],
    examples: [
      `${p}ai provider set [${providerOpts}]`,
      `${p}ai provider deposit <sats> [--new]`,
      `${p}ai provider balance`,
      `${p}ai provider models [filter]`,
    ],
  };
}
