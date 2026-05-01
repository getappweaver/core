import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiAgentsSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'agents',
    summary: 'Manage OpenCode agents in the web UI.',
    textHidden: true,
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}ai agents`],
    webWidget: {
      placement: 'fixed',
      surface: 'modal',
      modalTitle: 'OpenCode Agents',
    },
  };
}
