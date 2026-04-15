// ---------------------------------------------------------------------------
// src/commands/bunker/definition.ts
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getBunkerAddSubcommandDefinition } from './add/definition';
import { getBunkerListSubcommandDefinition } from './list/definition';

type GetBunkerCommandDefinitionProps = {
  prefix: string;
};

export function getBunkerCommandDefinition({
  prefix,
}: GetBunkerCommandDefinitionProps): CommandDefinition {
  const p = prefix;

  return {
    name: 'bunker',
    summary: 'Bunker remote signers: list and add connections.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'bunker', {
        topicArgSummary: 'Optional: list or add.',
        exampleTopics: ['list', 'add'],
      }),
      getBunkerListSubcommandDefinition(p),
      getBunkerAddSubcommandDefinition(p),
    ],
  };
}
