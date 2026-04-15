import { z } from 'zod';

import { AgentModeSchema } from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';

export const AiModeDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
    allowedModes: z.string().min(1),
  }),
  z.object({
    view: z.literal('unknown'),
    prefix: z.string().min(1),
    modeArg: z.string(),
    allowedModes: z.string().min(1),
  }),
  z.object({
    view: z.literal('set'),
    mode: AgentModeSchema,
  }),
]);

export const AiModeRepresentationSchema = createRepresentationSchema(
  AiModeDataSchema,
).extend({
  kind: z.literal('ai.mode'),
});

export type AiModeRepresentation = z.infer<typeof AiModeRepresentationSchema>;

type BuildAiModeRepresentationProps = {
  modeArg: string;
  prefix: string;
};

export function buildAiModeRepresentation({
  modeArg,
  prefix,
}: BuildAiModeRepresentationProps): AiModeRepresentation {
  if (!modeArg) {
    return {
      kind: 'ai.mode',
      version: 1,
      meta: { command: 'ai', subcommand: 'mode' },
      data: {
        view: 'usage',
        prefix,
        allowedModes: AgentModeSchema.options.join('|'),
      },
    };
  }

  const parsed = AgentModeSchema.safeParse(modeArg);

  if (!parsed.success) {
    return {
      kind: 'ai.mode',
      version: 1,
      meta: { command: 'ai', subcommand: 'mode' },
      data: {
        view: 'unknown',
        prefix,
        modeArg,
        allowedModes: AgentModeSchema.options.join(', '),
      },
    };
  }

  return {
    kind: 'ai.mode',
    version: 1,
    meta: { command: 'ai', subcommand: 'mode' },
    data: { view: 'set', mode: parsed.data },
  };
}
