import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const InfoLogsToggleSchema = z.enum(['on', 'off']);

export const BotLogDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
    variant: z.enum(['wrong-subcommand', 'missing-toggle']),
    currentOn: z.boolean(),
  }),
  z.object({
    view: z.literal('toggled'),
    enabled: z.boolean(),
  }),
]);

export const BotLogRepresentationSchema = createRepresentationSchema(
  BotLogDataSchema,
).extend({
  kind: z.literal('bot.log'),
});

export type BotLogRepresentation = z.infer<typeof BotLogRepresentationSchema>;

function toRepresentation(
  data: BotLogRepresentation['data'],
): BotLogRepresentation {
  return {
    kind: 'bot.log',
    version: 1,
    meta: { command: 'bot', subcommand: 'log' },
    data,
  };
}

type BuildBotLogRepresentationProps = {
  prefix: string;
  args: string[];
  getInfoLogsEnabled: () => boolean;
};

export function buildBotLogRepresentation(
  props: BuildBotLogRepresentationProps,
): BotLogRepresentation {
  const { prefix, args, getInfoLogsEnabled } = props;
  const logSub = args[0]?.toLowerCase();
  const currentOn = getInfoLogsEnabled();

  if (logSub !== 'info') {
    return toRepresentation({
      view: 'usage',
      prefix,
      variant: 'wrong-subcommand',
      currentOn,
    });
  }

  const logArg = (args[1] ?? '').toLowerCase();

  if (logArg !== 'on' && logArg !== 'off') {
    return toRepresentation({
      view: 'usage',
      prefix,
      variant: 'missing-toggle',
      currentOn,
    });
  }

  return toRepresentation({
    view: 'toggled',
    enabled: logArg === 'on',
  });
}
