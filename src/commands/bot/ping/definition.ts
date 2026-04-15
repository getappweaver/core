import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotPingSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'ping',
    summary: 'Health check (replies pong).',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}bot ping`],
  };
}
