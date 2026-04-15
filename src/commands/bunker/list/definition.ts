import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBunkerListSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'list',
    summary: 'List saved bunker signer connections.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}bunker list`],
  };
}
