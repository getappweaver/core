import { ProviderNameSchema } from '@src/db';
import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiProviderSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;
  const providerOpts = ProviderNameSchema.options.join('|');

  return {
    name: 'provider',
    summary: 'Select the active AI payment provider.',
    aliases: [],
    arguments: [
      {
        name: 'name',
        summary: `Provider name: ${providerOpts}`,
        kind: 'string',
        required: false,
        variadic: false,
        choices: ProviderNameSchema.options,
      },
    ],
    options: [],
    examples: [`${p}ai provider [${providerOpts}]`, `${p}ai provider routstr`],
    webExecutionMode: 'runnable_customizable',
  };
}
