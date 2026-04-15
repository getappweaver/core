import { LintingSchema } from '@src/db';
import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotLintSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'lint',
    summary: `Run lint or configure auto-lint after agent.`,
    aliases: [],
    arguments: [
      {
        name: 'args',
        summary: 'Optional: auto, auto on|off',
        kind: 'string',
        required: false,
        variadic: true,
      },
    ],
    options: [],
    examples: [
      `${p}bot lint`,
      `${p}bot lint auto`,
      `${p}bot lint auto [${LintingSchema.options.join('|')}]`,
    ],
  };
}
