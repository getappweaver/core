import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionResumeLastSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'resume-last',
    summary: 'Resume the latest session for the current backend.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}session resume-last`],
  };
}
