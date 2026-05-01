import { z } from 'zod';

import { createRepresentationSchema } from '@src/system/representation';

export const HelpArgumentSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  kind: z.enum(['string', 'integer', 'boolean']),
  required: z.boolean(),
  variadic: z.boolean(),
});

export const HelpOptionSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  flag: z.string().min(1),
  shortFlag: z.string().min(2).nullable(),
  kind: z.enum(['string', 'integer', 'boolean']),
  required: z.boolean(),
});

export const HelpSubcommandSummarySchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  usage: z.string().min(1),
});

export const HelpCommandInfoSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
});

export const HelpSubcommandDetailSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  details: z.array(z.string().min(1)),
  aliases: z.array(z.string().min(1)),
  arguments: z.array(HelpArgumentSchema),
  options: z.array(HelpOptionSchema),
  examples: z.array(z.string().min(1)),
});

export const HelpDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('command'),
    command: HelpCommandInfoSchema,
    subcommands: z.array(HelpSubcommandSummarySchema),
    examples: z.array(z.string().min(1)),
  }),
  z.object({
    view: z.literal('subcommand'),
    command: HelpCommandInfoSchema,
    subcommand: HelpSubcommandDetailSchema,
  }),
]);

export const HelpRepresentationSchema = createRepresentationSchema(
  HelpDataSchema,
).extend({
  kind: z.literal('help'),
});

export type HelpRepresentation = z.infer<typeof HelpRepresentationSchema>;

export function createHelpRepresentation(params: {
  command: string;
  subcommand: string;
  data: HelpRepresentation['data'];
}): HelpRepresentation {
  return {
    kind: 'help',
    version: 1,
    meta: {
      command: params.command,
      subcommand: params.subcommand,
    },
    data: params.data,
  };
}
