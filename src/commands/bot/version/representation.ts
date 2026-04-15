import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const BotVersionDataSchema = z.object({
  version: z.string().min(1),
});

export const BotVersionRepresentationSchema = createRepresentationSchema(
  BotVersionDataSchema,
).extend({
  kind: z.literal('bot.version'),
});

export type BotVersionRepresentation = z.infer<
  typeof BotVersionRepresentationSchema
>;

type CreateBotVersionRepresentationProps = {
  version: string;
};

export function createBotVersionRepresentation({
  version,
}: CreateBotVersionRepresentationProps): BotVersionRepresentation {
  return {
    kind: 'bot.version',
    version: 1,
    meta: { command: 'bot', subcommand: 'version' },
    data: { version },
  };
}
