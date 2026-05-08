import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiAgentSaveSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'agents save',
    summary: 'Save the full OpenCode agents draft config.',
    textHidden: true,
    aliases: [],
    arguments: [
      {
        name: 'draft_json',
        summary: 'Serialized OpenCode agents draft JSON',
        kind: 'string',
        required: true,
        variadic: true,
      },
    ],
    options: [],
    examples: [`${p}ai agents save '{"rootModel":null,"agents":[]}'`],
  };
}
