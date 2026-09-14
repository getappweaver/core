import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletListSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'list',
    summary: 'Show the Cashu wallet widget in the web UI.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}cashu list`],
  };
}
