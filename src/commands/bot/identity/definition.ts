import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotIdentitySubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'identity',
    summary:
      'Print the bot npub. A trailing literal npub is accepted for compatibility.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}bot identity`, `${p}bot identity npub`],
  };
}
