import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiAgentsDeleteSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'agents-delete',
    summary: 'Delete an OpenCode agent.',
    textHidden: true,
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
    examples: [`${prefix}ai agents delete plan`],
  };
}
