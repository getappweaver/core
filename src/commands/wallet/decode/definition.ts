import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletDecodeSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'decode',
    summary: 'Decode a Cashu token (no spend).',
    aliases: [],
    arguments: [
      {
        name: 'token',
        summary: 'Cashu token',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}wallet decode <token>`],
  };
}
