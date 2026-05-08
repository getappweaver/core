import type { SubcommandDefinition } from '@src/system/command-definition';

export function getAiAgentRestoreSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'agents restore',
    summary:
      'Restore OpenCode agents in opencode.json to the built-in defaults.',
    details: [
      'Use this recovery command if custom agent edits break your OpenCode config.',
      'It removes custom agents and restores the built-in agent definitions.',
    ],
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}ai agents restore`],
  };
}
