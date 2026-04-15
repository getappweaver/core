import { AgentModeSchema } from '@src/db';
import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiModeSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;
  const modeOpts = AgentModeSchema.options.join('|');

  return {
    name: 'mode',
    summary: 'Set default agent mode.',
    aliases: [],
    arguments: [
      {
        name: 'mode',
        summary: `One of: ${modeOpts}`,
        kind: 'string',
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}ai mode`, `${p}ai mode ask`],
  };
}
