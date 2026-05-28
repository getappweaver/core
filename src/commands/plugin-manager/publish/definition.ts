import type { SubcommandDefinition } from '@src/system/command-definition';

export function getPluginsPublishSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'publish',
    summary:
      'Publish the local plugin package version to the Nostr plugin catalog.',
    aliases: [],
    arguments: [
      {
        name: 'alias',
        summary: 'Installed plugin alias from plugins.json.',
        kind: 'string',
        required: true,
        variadic: false,
        choices: null,
      },
    ],
    options: [],
    examples: [`${prefix}plugins publish bm`],
  };
}
