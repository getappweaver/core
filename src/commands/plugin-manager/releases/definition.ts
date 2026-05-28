import type { SubcommandDefinition } from '@src/system/command-definition';

export function getPluginsReleasesSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'releases',
    summary:
      'List installed plugins whose published plugin events match a local signer.',
    aliases: ['release', 'publish-status'],
    arguments: [],
    options: [],
    examples: [`${prefix}plugins releases`],
  };
}
