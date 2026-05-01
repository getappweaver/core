import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiAgentsUpsertJsonSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'agents-upsert-json',
    summary: 'Internal structured save for the AI agent editor.',
    textHidden: true,
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${prefix}ai agents-upsert-json`],
  };
}
