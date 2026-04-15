import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotLogSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'log',
    summary: 'Show or set info-level console logs.',
    aliases: [],
    arguments: [
      {
        name: 'args',
        summary: 'info on|off',
        kind: 'string',
        required: false,
        variadic: true,
      },
    ],
    options: [],
    examples: [`${p}bot log info on`],
  };
}
