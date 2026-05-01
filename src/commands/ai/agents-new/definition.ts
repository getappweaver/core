import type { SubcommandDefinition } from '@src/system/command-definition';

import { getAiAgentPermissionOptionDefinitions } from '../agents-permission-options';

export function getAiAgentsNewSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'agents-new',
    summary: 'Create a new OpenCode agent.',
    textHidden: true,
    aliases: [],
    arguments: [
      {
        name: 'name',
        summary: 'Agent name',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [
      {
        name: 'description',
        summary: 'Optional description',
        flag: '--description',
        kind: 'string',
        required: false,
      },
      {
        name: 'model',
        summary: 'Optional model id',
        flag: '--model',
        kind: 'string',
        required: false,
      },
      {
        name: 'color',
        summary: 'Optional color',
        flag: '--color',
        kind: 'string',
        required: false,
        choices: ['info', 'warning', 'danger', 'success'],
      },
      {
        name: 'steps',
        summary: 'Optional max steps',
        flag: '--steps',
        kind: 'integer',
        required: false,
      },
      {
        name: 'mode',
        summary: 'Agent mode',
        flag: '--mode',
        kind: 'string',
        required: false,
        choices: ['primary', 'subagent', 'all'],
      },
      {
        name: 'system_prompt',
        summary: 'Markdown system prompt body',
        flag: '--prompt',
        kind: 'string',
        required: false,
      },
      {
        name: 'hidden',
        summary: 'Hide agent from normal menus',
        flag: '--hidden',
        kind: 'boolean',
        required: false,
      },
      {
        name: 'disabled',
        summary: 'Disable agent',
        flag: '--disabled',
        kind: 'boolean',
        required: false,
      },
      ...getAiAgentPermissionOptionDefinitions(),
    ],
    examples: [`${p}ai agents new reviewer --model openai/gpt-5.4`],
  };
}
