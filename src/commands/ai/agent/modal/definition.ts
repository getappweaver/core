import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiAgentModalSubcommandDefinition(
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
    examples: [`${p}ai agents`, `${p}ai agents modal`],
    webWidget: {
      placement: 'fixed',
      surface: 'modal',
      modalTitle: 'OpenCode Agents',
    },
  };
}
