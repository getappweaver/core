import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletHistorySubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'history',
    summary: 'Recent spend history.',
    aliases: [],
    arguments: [
      {
        name: 'flags',
        summary: 'Optional --token',
        kind: 'string',
        required: false,
        variadic: true,
      },
    ],
    options: [],
    examples: [`${p}cashu history`, `${p}cashu history --token`],
  };
}
