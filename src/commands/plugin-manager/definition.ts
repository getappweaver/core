import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getPluginsInstallSubcommandDefinition } from './install/definition';
import { getPluginsPublishSubcommandDefinition } from './publish/definition';
import { getPluginsReleasesSubcommandDefinition } from './releases/definition';

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
        topicArgSummary: 'Optional subcommand: install, releases, or publish.',
        exampleTopics: ['install', 'releases', 'publish'],
      }),
      getPluginsInstallSubcommandDefinition(prefix),
      getPluginsReleasesSubcommandDefinition(prefix),
      getPluginsPublishSubcommandDefinition(prefix),
    ],
  };
}
