import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionResumeSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'resume',
    summary: 'Resume a session by id (any backend).',
    aliases: [],
    arguments: [
      {
        name: 'session_id',
        summary: 'Session id to resume.',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}session resume <session_id>`],
  };
}
