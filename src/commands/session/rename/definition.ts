import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionRenameSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'rename',
    summary: 'Set the AppWeaver title of a tracked session.',
    aliases: [],
    arguments: [
      {
        name: 'session_id',
        summary: 'Session ID to rename.',
        kind: 'string',
        required: true,
        variadic: false,
      },
      {
        name: 'title',
        summary: 'New title (up to 120 characters).',
        kind: 'string',
        required: true,
        variadic: true,
      },
    ],
    options: [],
    examples: [`${prefix}session rename <session_id> <title>`],
  };
}
