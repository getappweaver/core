import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiAgentSetSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'agents set',
    summary: 'Select the current OpenCode agent.',
    aliases: [],
    arguments: [
      {
        name: 'name',
        summary: 'Agent name',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}ai agents set ask`],
  };
}
