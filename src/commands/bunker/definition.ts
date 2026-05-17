// ---------------------------------------------------------------------------
// src/commands/bunker/definition.ts
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getBunkerAddSubcommandDefinition } from './add/definition';
import { getBunkerDeleteSubcommandDefinition } from './delete/definition';
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
    summary: 'Bunker remote signers: list, add, and delete connections.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'bunker', {
        topicArgSummary: 'Optional: list, add, or delete.',
        exampleTopics: ['list', 'add', 'delete'],
      }),
      getBunkerListSubcommandDefinition(p),
      getBunkerAddSubcommandDefinition(p),
      getBunkerDeleteSubcommandDefinition(p),
    ],
  };
}
