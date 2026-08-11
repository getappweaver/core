import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

export function getSkillsCommandDefinition(prefix: string): CommandDefinition {
  return {
    name: 'skills',
    summary: 'Enable or disable AppWeaver skills for this workspace.',
    aliases: ['skill'],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'skills', {
        topicArgSummary: 'Optional subcommand: manager or set.',
        exampleTopics: ['manager'],
      }),
      {
        name: 'manager',
        summary: 'Open the workspace skills manager.',
        textHidden: true,
        aliases: ['list'],
        arguments: [],
        options: [],
        examples: [`${prefix}skills manager`],
        webWidget: {
          placement: 'fixed',
          surface: 'modal',
          modalTitle: 'Skills Manager',
          icon: '/src/commands/skills/renderers/skills.svg',
        },
      },
      {
        name: 'set',
        summary: 'Enable or disable a managed skill.',
        textHidden: true,
        aliases: [],
        arguments: [
          {
            name: 'name',
            summary: 'Managed skill name.',
            kind: 'string',
            choices: null,
            required: true,
            variadic: false,
          },
          {
            name: 'status',
            summary: 'Desired skill status.',
            kind: 'string',
            choices: ['enable', 'disable'],
            required: true,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${prefix}skills set appweaver-todo enable`],
      },
    ],
  };
}
