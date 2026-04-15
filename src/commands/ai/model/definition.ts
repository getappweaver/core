import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiModelSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'model',
    summary: 'Show or set model override (cleared when backend changes).',
    aliases: [],
    arguments: [
      {
        name: 'name_or_reset',
        summary: 'Model id, reset, or omit to show',
        kind: 'string',
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}ai model`, `${p}ai model reset`],
  };
}
