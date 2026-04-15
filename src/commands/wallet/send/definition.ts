import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletSendSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'send',
    summary: 'Create and send a Cashu token (sats).',
    aliases: [],
    arguments: [
      {
        name: 'sats',
        summary: 'Amount in satoshis',
        kind: 'integer',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}wallet send <sats>`],
  };
}
