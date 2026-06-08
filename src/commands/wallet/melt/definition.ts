import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletMeltSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'melt',
    summary: 'Pay a BOLT11 Lightning invoice using Cashu proofs.',
    aliases: [],
    arguments: [
      {
        name: 'sats',
        summary: 'Invoice amount in satoshis',
        kind: 'integer',
        required: true,
        variadic: false,
      },
      {
        name: 'invoice',
        summary: 'BOLT11 Lightning invoice',
        kind: 'string',
        required: false,
        variadic: false,
      },
    ],
    options: [
      {
        name: 'mint',
        summary: 'Mint URL to melt from. Defaults to the selected wallet mint.',
        flag: '--mint',
        shortFlag: null,
        kind: 'string',
        required: false,
      },
    ],
    examples: [
      `${p}wallet melt <sats> <bolt11-invoice>`,
      `${p}wallet melt <sats> <bolt11-invoice> --mint <url>`,
    ],
    webExecutionMode: 'requires_input',
  };
}
