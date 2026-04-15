import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletMintsSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'mints',
    summary: 'List mints in wallet.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}wallet mints`],
  };
}
