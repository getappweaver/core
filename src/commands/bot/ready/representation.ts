import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const ReadyToggleSchema = z.enum(['on', 'off']);

export const BotReadyDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
    current: ReadyToggleSchema,
  }),
  z.object({
    view: z.literal('toggled'),
    value: ReadyToggleSchema,
  }),
]);

export const BotReadyRepresentationSchema = createRepresentationSchema(
  BotReadyDataSchema,
).extend({
  kind: z.literal('bot.ready'),
});

export type BotReadyRepresentation = z.infer<
  typeof BotReadyRepresentationSchema
>;

function toRepresentation(
  data: BotReadyRepresentation['data'],
): BotReadyRepresentation {
  return {
    kind: 'bot.ready',
    version: 1,
    meta: { command: 'bot', subcommand: 'ready' },
    data,
  };
}

type BuildBotReadyRepresentationProps = {
  prefix: string;
  args: string[];
  getReadyCurrent: () => 'on' | 'off';
};

export function buildBotReadyRepresentation(
  props: BuildBotReadyRepresentationProps,
): BotReadyRepresentation {
  const { prefix, args, getReadyCurrent } = props;
  const readyArg = args[0]?.toLowerCase();
  const readyCurrent = getReadyCurrent();

  if (readyArg !== 'on' && readyArg !== 'off') {
    return toRepresentation({
      view: 'usage',
      prefix,
      current: readyCurrent,
    });
  }

  const value: z.infer<typeof ReadyToggleSchema> =
    readyArg === 'on' ? 'on' : 'off';

  return toRepresentation({
    view: 'toggled',
    value,
  });
}
