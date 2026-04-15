import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const BotPingDataSchema = z.object({});

export const BotPingRepresentationSchema = createRepresentationSchema(
  BotPingDataSchema,
).extend({
  kind: z.literal('bot.ping'),
});

export type BotPingRepresentation = z.infer<typeof BotPingRepresentationSchema>;

export function createBotPingRepresentation(): BotPingRepresentation {
  return {
    kind: 'bot.ping',
    version: 1,
    meta: { command: 'bot', subcommand: 'ping' },
    data: {},
  };
}
