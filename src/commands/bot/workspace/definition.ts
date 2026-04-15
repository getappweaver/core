import { WorkspaceTargetSchema } from '@src/db';
import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotWorkspaceSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;
  const workspaceOpts = WorkspaceTargetSchema.options.join('|');

  return {
    name: 'workspace',
    summary: `Show or set workspace target [${workspaceOpts}].`,
    aliases: [],
    arguments: [
      {
        name: 'target',
        summary: 'parent or bot',
        kind: 'string',
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}bot workspace`, `${p}bot workspace bot`],
  };
}
