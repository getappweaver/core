// ---------------------------------------------------------------------------
// src/commands/wallet/definition.ts
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getWalletBalanceSubcommandDefinition } from './balance/definition';
import { getWalletDecodeSubcommandDefinition } from './decode/definition';
import { getWalletHistorySubcommandDefinition } from './history/definition';
import { getWalletMintSubcommandDefinition } from './mint/definition';
import { getWalletMintsSubcommandDefinition } from './mints/definition';
import { getWalletReceiveSubcommandDefinition } from './receive/definition';
import { getWalletSendSubcommandDefinition } from './send/definition';

type GetWalletCommandDefinitionProps = {
  prefix: string;
};

export function getWalletCommandDefinition({
  prefix,
}: GetWalletCommandDefinitionProps): CommandDefinition {
  const p = prefix;

  return {
    name: 'wallet',
    summary: 'Cashu wallet: mint, balance, receive, send, history.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'wallet', {
        topicArgSummary: 'Optional: mint, balance, receive, …',
        exampleTopics: ['mint', 'balance'],
      }),
      getWalletMintSubcommandDefinition(p),
      getWalletMintsSubcommandDefinition(p),
      getWalletBalanceSubcommandDefinition(p),
      getWalletDecodeSubcommandDefinition(p),
      getWalletReceiveSubcommandDefinition(p),
      getWalletSendSubcommandDefinition(p),
      getWalletHistorySubcommandDefinition(p),
    ],
  };
}
