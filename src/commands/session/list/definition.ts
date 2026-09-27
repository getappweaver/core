import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionListSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'list',
    summary: 'List recent sessions (default 20).',
    aliases: [],
    arguments: [],
    options: [
      {
        name: 'limit',
        summary: 'Maximum number of sessions to list.',
        flag: '--limit',
        shortFlag: null,
        kind: 'integer',
        required: false,
        multiple: false,
        choices: null,
      },
    ],
    examples: [`${p}session list`, `${p}session list --limit 50`],
  };
}
