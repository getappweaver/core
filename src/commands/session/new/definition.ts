import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionNewSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'new',
    summary: 'Create a new agent session.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}session new`],
  };
}
