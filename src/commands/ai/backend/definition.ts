import { AgentBackendNameSchema } from '@src/db';
import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiBackendSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;
  const backendOpts = AgentBackendNameSchema.options.join('|');

  return {
    name: 'backend',
    summary: `Show or set agent backend [${backendOpts}].`,
    aliases: [],
    arguments: [
      {
        name: 'name',
        summary: 'Backend name or omit to show current',
        kind: 'string',
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}ai backend`, `${p}ai backend opencode`],
  };
}
