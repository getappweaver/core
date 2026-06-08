import type { SubcommandDefinition } from '@src/system/command-definition';

export function getWalletPaySubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'pay',
    summary: 'Mint Cashu tokens by paying a Lightning invoice.',
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
        summary: 'Mint URL to use. Defaults to the selected wallet mint.',
        flag: '--mint',
        shortFlag: null,
        kind: 'string',
        required: false,
      },
      {
        name: 'quote',
        summary: 'Mint quote id used when claiming a paid invoice.',
        flag: '--quote',
        shortFlag: null,
        kind: 'string',
        required: false,
      },
      {
        name: 'claim',
        summary: 'Claim the quote after the invoice is paid.',
        flag: '--claim',
        shortFlag: null,
        kind: 'boolean',
        required: false,
      },
    ],
    examples: [`${p}wallet pay <sats>`, `${p}wallet pay <sats> --mint <url>`],
    webExecutionMode: 'requires_input',
  };
}
