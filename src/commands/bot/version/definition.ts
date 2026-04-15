import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotVersionSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'version',
    summary: 'Show git hash (dm-bot project).',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}bot version`],
  };
}
