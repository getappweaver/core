import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotUpdateSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'update',
    summary: 'Run git pull --ff-only for AppWeaver and restart if updated.',
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${p}bot update`],
    webExecutionMode: 'runnable_default',
  };
}
