import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotPushSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'push',
    summary:
      'Send a test Web Push to all browsers that clicked Push (requires VAPID in .env).',
    aliases: [],
    arguments: [
      {
        name: 'message',
        summary: 'Notification body text',
        kind: 'string',
        required: true,
        variadic: true,
      },
    ],
    options: [],
    examples: [`${p}bot push Hello from the bot`],
  };
}
