import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionAttachSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'attach',
    summary:
      'Attach an external session id and set it as current (opencode only for now).',
    aliases: [],
    arguments: [
      {
        name: 'backend',
        summary: 'External backend: opencode or cursor.',
        kind: 'string',
        required: true,
        variadic: false,
      },
      {
        name: 'session_id',
        summary: 'External session id to attach.',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}session attach opencode <session_id>`],
  };
}
