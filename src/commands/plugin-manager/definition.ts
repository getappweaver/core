import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getPluginsInstallSubcommandDefinition } from './install/definition';

type GetPluginsCommandDefinitionProps = {
  prefix: string;
};

export function getPluginsCommandDefinition({
  prefix,
}: GetPluginsCommandDefinitionProps): CommandDefinition {
  return {
    name: 'plugins',
    summary: 'Discover installable bot plugins.',
    aliases: ['plugin'],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'plugins', {
        topicArgSummary: 'Optional subcommand: install.',
        exampleTopics: ['install'],
      }),
      getPluginsInstallSubcommandDefinition(prefix),
    ],
  };
}
