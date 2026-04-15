import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const BotIdentityDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('npub'),
    npub: z.string().min(1),
  }),
  z.object({
    view: z.literal('no-pubkey'),
  }),
]);

export const BotIdentityRepresentationSchema = createRepresentationSchema(
  BotIdentityDataSchema,
).extend({
  kind: z.literal('bot.identity'),
});

export type BotIdentityRepresentation = z.infer<
  typeof BotIdentityRepresentationSchema
>;

type CreateBotIdentityUsageRepresentationProps = {
  prefix: string;
};

export function createBotIdentityUsageRepresentation({
  prefix,
}: CreateBotIdentityUsageRepresentationProps): BotIdentityRepresentation {
  return {
    kind: 'bot.identity',
    version: 1,
    meta: { command: 'bot', subcommand: 'identity' },
    data: { view: 'usage', prefix },
  };
}

type CreateBotIdentityNpubRepresentationProps = {
  npub: string;
};

export function createBotIdentityNpubRepresentation({
  npub,
}: CreateBotIdentityNpubRepresentationProps): BotIdentityRepresentation {
  return {
    kind: 'bot.identity',
    version: 1,
    meta: { command: 'bot', subcommand: 'identity' },
    data: { view: 'npub', npub },
  };
}

export function createBotIdentityNoPubkeyRepresentation(): BotIdentityRepresentation {
  return {
    kind: 'bot.identity',
    version: 1,
    meta: { command: 'bot', subcommand: 'identity' },
    data: { view: 'no-pubkey' },
  };
}
