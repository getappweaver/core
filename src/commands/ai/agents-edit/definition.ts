import type { SubcommandDefinition } from '@src/system/command-definition';

import { getAiAgentsNewSubcommandDefinition } from '../agents-new/definition';

export function getAiAgentsEditSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const base = getAiAgentsNewSubcommandDefinition(prefix);

  return {
    ...base,
    name: 'agents-edit',
    summary: 'Edit an existing OpenCode agent.',
    examples: [`${prefix}ai agents edit plan`],
  };
}
