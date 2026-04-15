import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionListSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'list',
    summary: 'List all sessions (all backends).',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}session list`],
  };
}
