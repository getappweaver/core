// ---------------------------------------------------------------------------
// src/commands/cashu/definition.ts
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getWalletBalanceSubcommandDefinition } from './balance/definition';
import { getWalletDecodeSubcommandDefinition } from './decode/definition';
import { getWalletHistorySubcommandDefinition } from './history/definition';
import { getWalletListSubcommandDefinition } from './list/definition';
import { getWalletMeltSubcommandDefinition } from './melt/definition';
import { getWalletMintSubcommandDefinition } from './mint/definition';
import { getWalletMintsSubcommandDefinition } from './mints/definition';
import { getWalletPaySubcommandDefinition } from './pay/definition';
import { getWalletReceiveSubcommandDefinition } from './receive/definition';
import { getWalletSendSubcommandDefinition } from './send/definition';

type GetCashuCommandDefinitionProps = {
  prefix: string;
};

export function getCashuCommandDefinition({
  prefix,
}: GetCashuCommandDefinitionProps): CommandDefinition {
  const p = prefix;

  return {
    name: 'cashu',
    summary: 'Cashu wallet: mint, melt, balance, receive, send, history.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'cashu', {
        topicArgSummary: 'Optional: mint, balance, receive, …',
        exampleTopics: ['mint', 'balance'],
      }),
      getWalletListSubcommandDefinition(p),
      getWalletMintSubcommandDefinition(p),
      getWalletMeltSubcommandDefinition(p),
      getWalletPaySubcommandDefinition(p),
      getWalletMintsSubcommandDefinition(p),
      getWalletBalanceSubcommandDefinition(p),
      getWalletDecodeSubcommandDefinition(p),
      getWalletReceiveSubcommandDefinition(p),
      getWalletSendSubcommandDefinition(p),
      getWalletHistorySubcommandDefinition(p),
    ],
  };
}
