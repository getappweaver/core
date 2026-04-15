import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletBalanceSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'balance',
    summary: 'Show Cashu balance for default mint.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}wallet balance`],
  };
}
