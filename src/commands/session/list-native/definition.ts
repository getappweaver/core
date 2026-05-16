import type { SubcommandDefinition } from '@src/system/command-definition';

export function getSessionListNativeSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'list-native',
    summary: 'List native OpenCode sessions discoverable on this machine.',
    aliases: [],
    arguments: [],
    options: [
      {
        name: 'opencode',
        summary: 'List native OpenCode sessions for the active workspace.',
        flag: '--opencode',
        shortFlag: null,
        kind: 'boolean',
        required: true,
        multiple: false,
        choices: null,
      },
    ],
    examples: [`${p}session list-native --opencode`],
  };
}
