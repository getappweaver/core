import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiModelsSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'models',
    summary: 'List models available for the current backend.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}ai models`],
  };
}
