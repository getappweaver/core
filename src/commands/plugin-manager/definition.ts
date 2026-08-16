import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getPluginsInstallSubcommandDefinition } from './install/definition';
import { getPluginsNewSubcommandDefinition } from './new/definition';
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
    summary: 'Create, develop, install, and publish AppWeaver plugins.',
    aliases: ['plugin'],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'plugins', {
        topicArgSummary:
          'Optional subcommand: new, install, releases, or publish.',
        exampleTopics: ['new', 'install', 'releases', 'publish'],
      }),
      getPluginsNewSubcommandDefinition(prefix),
      getPluginsInstallSubcommandDefinition(prefix),
      getPluginsReleasesSubcommandDefinition(prefix),
      getPluginsPublishSubcommandDefinition(prefix),
    ],
  };
}
