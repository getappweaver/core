import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

export function getWalletCommandDefinition({
  prefix,
}: {
  prefix: string;
}): CommandDefinition {
  return {
    name: 'wallet',
    summary: 'Overview of available Lightning and Cashu wallets.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'wallet', {
        topicArgSummary: 'Optional: list',
        exampleTopics: ['list'],
      }),
      {
        name: 'list',
        summary: 'Show the aggregate wallet overview.',
        aliases: [],
        arguments: [],
        options: [],
        examples: [`${prefix}wallet list`],
        webWidget: {
          placement: 'header',
          surface: 'modal',
          label: 'Wallet',
          modalTitle: 'Wallets',
          icon: '/src/commands/wallet/list/renderers/wallet.svg',
          order: 30,
        },
      },
    ],
  };
}
