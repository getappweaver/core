import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotRestartSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'restart',
    summary:
      'Request a process restart when running under watch (creates restart.requested).',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}bot restart`],
  };
}
