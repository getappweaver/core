import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotStatusSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'status',
    summary: 'Bot status and current session/mode/backend.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}bot status`],
    webHeaderWidget: {
      label: 'Status',
      modalTitle: 'Bot status',
    },
  };
}
