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
    options: [
      {
        name: 'mint',
        summary: 'Mint URL to send from. Defaults to the selected wallet mint.',
        flag: '--mint',
        shortFlag: null,
        kind: 'string',
        required: false,
      },
    ],
    examples: [`${p}wallet send <sats>`, `${p}wallet send <sats> --mint <url>`],
  };
}
