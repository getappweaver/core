import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotBrowserSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'browser',
    summary:
      'Run a demo browser task with the current AI backend and a persistent Playwright profile.',
    aliases: [],
    arguments: [
      {
        name: 'prompt',
        summary: 'Natural-language browser task to complete',
        kind: 'string',
        required: true,
        variadic: true,
      },
    ],
    options: [],
    examples: [
      `${p}bot browser open https://example.com, take a snapshot, click the main link, and tell me where you ended up`,
    ],
  };
}
