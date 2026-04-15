import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotReadySubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'ready',
    summary: 'Show or set startup "Agent is ready" DM.',
    aliases: [],
    arguments: [
      {
        name: 'state',
        summary: 'on or off',
        kind: 'string',
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}bot ready`, `${p}bot ready off`],
  };
}
