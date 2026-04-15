import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletReceiveSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'receive',
    summary: 'Receive a Cashu token.',
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
    examples: [`${p}wallet receive <token>`],
  };
}
