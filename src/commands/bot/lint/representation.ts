import { z } from 'zod';

import {
  type CoreDb,
  LintingSchema,
  getLinting,
  getWorkspaceTarget,
  setLinting,
} from '@src/db';
import { runPostAgentLint } from '@src/lint';
import { createRepresentationSchema } from '@src/system/representation';

export const LintRunResultSchema = z.object({
  label: z.string().min(1),
  available: z.boolean(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
});

export const BotLintDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('run'),
    result: LintRunResultSchema,
  }),
  z.object({
    view: z.literal('auto-query'),
    value: LintingSchema,
  }),
  z.object({
    view: z.literal('auto-set'),
    value: LintingSchema,
  }),
  z.object({
    view: z.literal('usage'),
    prefix: z.string().min(1),
    lintOpts: z.string().min(1),
  }),
  z.object({
    view: z.literal('auto-invalid'),
    prefix: z.string().min(1),
    lintOpts: z.string().min(1),
  }),
]);

export const BotLintRepresentationSchema = createRepresentationSchema(
  BotLintDataSchema,
).extend({
  kind: z.literal('bot.lint'),
});

export type BotLintRepresentation = z.infer<typeof BotLintRepresentationSchema>;
export type LintRunResult = z.infer<typeof LintRunResultSchema>;

function toRepresentation(
  data: BotLintRepresentation['data'],
): BotLintRepresentation {
  return {
    kind: 'bot.lint',
    version: 1,
    meta: { command: 'bot', subcommand: 'lint' },
    data,
  };
}

type BuildBotLintRepresentationFromArgsProps = {
  db: CoreDb;
  args: string[];
  cwd: string;
  prefix: string;
};

export function buildBotLintRepresentationFromArgs(
  props: BuildBotLintRepresentationFromArgsProps,
): BotLintRepresentation {
  const { db, args, cwd, prefix } = props;
  const first = args[0]?.toLowerCase();
  const second = args[1]?.toLowerCase();

  if (args.length === 0) {
    const workspace = getWorkspaceTarget(db);
    const label = workspace === 'bot' ? 'dm-bot' : 'workspace';
    const result = runPostAgentLint({ cwd, label });

    return toRepresentation({
      view: 'run',
      result: {
        label: result.label,
        available: result.available,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    });
  }

  if (first === 'auto' && second === undefined) {
    return toRepresentation({
      view: 'auto-query',
      value: getLinting(db),
    });
  }

  if (first === 'auto' && second !== undefined) {
    const parsed = LintingSchema.safeParse(second);

    if (!parsed.success) {
      const lintOpts = LintingSchema.options.join('|');

      return toRepresentation({
        view: 'auto-invalid',
        prefix,
        lintOpts,
      });
    }

    setLinting(db, parsed.data);

    return toRepresentation({
      view: 'auto-set',
      value: parsed.data,
    });
  }

  const lintOpts = LintingSchema.options.join('|');

  return toRepresentation({
    view: 'usage',
    prefix,
    lintOpts,
  });
}
