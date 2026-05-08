import type { SubcommandDefinition } from '@src/system/command-definition';

import { getAiAgentNewSubcommandDefinition } from '../new/definition';

export function getAiAgentEditSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const base = getAiAgentNewSubcommandDefinition(prefix);

  return {
    ...base,
    name: 'agents edit',
    summary: 'Edit an existing OpenCode agent.',
    examples: [`${prefix}ai agents edit plan`],
  };
}
