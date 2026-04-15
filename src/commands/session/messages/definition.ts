import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionMessagesSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'messages',
    summary: 'Show last N messages for a session (default N=5).',
    aliases: [],
    arguments: [
      {
        name: 'session_id',
        summary: 'Session id.',
        kind: 'string',
        required: true,
        variadic: false,
      },
      {
        name: 'n',
        summary: 'Number of messages (optional, default 5).',
        kind: 'integer',
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [
      `${p}session messages <session_id>`,
      `${p}session messages <session_id> 10`,
    ],
  };
}
