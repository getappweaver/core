import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletMintSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'mint',
    summary: 'Show or set default Cashu mint URL.',
    aliases: [],
    arguments: [
      {
        name: 'url',
        summary: 'Mint URL',
        kind: 'string',
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}wallet mint`, `${p}wallet mint <url>`],
  };
}
