import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotUpdateCheckSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'update-check',
    summary: 'Fetch upstream and check whether a core update is available.',
    aliases: ['updates'],
    arguments: [],
    options: [],
    examples: [`${p}bot update-check`],
    webExecutionMode: 'runnable_default',
  };
}
