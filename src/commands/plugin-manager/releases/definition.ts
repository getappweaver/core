import type { SubcommandDefinition } from '@src/system/command-definition';

export function getPluginsReleasesSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'releases',
    summary:
      'Review local plugin development, release, and publication readiness.',
    aliases: ['release', 'publish-status'],
    arguments: [],
    options: [
      {
        name: 'alias',
        summary: 'Optional plugin alias to filter to a single release card.',
        flag: '--alias',
        kind: 'string',
        required: false,
      },
    ],
    examples: [
      `${prefix}plugins releases`,
      `${prefix}plugins releases --alias todo`,
    ],
    monitoring: {
      name: 'plugins.releases',
      attributes: { command: 'plugins', subcommand: 'releases' },
    },
  };
}
