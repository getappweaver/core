import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionAdoptSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'adopt',
    summary: 'Adopt an existing native OpenCode session and set it current.',
    aliases: [],
    arguments: [
      {
        name: 'session_id',
        summary: 'Native OpenCode session id to adopt.',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}session adopt ses_...`],
  };
}
