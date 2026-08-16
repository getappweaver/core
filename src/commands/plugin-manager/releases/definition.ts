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
    options: [],
    examples: [`${prefix}plugins releases`],
  };
}
