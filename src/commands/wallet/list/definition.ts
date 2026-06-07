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
    examples: [`${p}wallet list`],
    webWidget: {
      placement: 'header',
      surface: 'modal',
      label: 'Wallet',
      modalTitle: 'Cashu Wallet',
      icon: '/src/commands/wallet/list/renderers/wallet.svg',
      order: 30,
    },
  };
}
