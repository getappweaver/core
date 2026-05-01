import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiRootModelSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'root-model',
    summary: 'Show or set the OpenCode root model.',
    aliases: [],
    arguments: [
      {
        name: 'model_or_reset',
        summary: 'Model id, reset, or omit to show current value',
        kind: 'string',
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}ai root-model`, `${p}ai root-model opencode/big-pickle`],
  };
}
