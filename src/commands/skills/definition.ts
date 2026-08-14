import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

export function getSkillsCommandDefinition(prefix: string): CommandDefinition {
  return {
    name: 'skills',
    summary: 'Manage AI instructions and skills for this workspace.',
    aliases: ['skill'],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'skills', {
        topicArgSummary: 'Optional subcommand: manager or set.',
        exampleTopics: ['manager'],
      }),
      {
        name: 'manager',
        summary: 'Open workspace AI configuration.',
        textHidden: true,
        aliases: ['list'],
        arguments: [],
        options: [],
        examples: [`${prefix}skills manager`],
        webWidget: {
          placement: 'fixed',
          surface: 'modal',
          modalTitle: 'AI Configuration',
          icon: '/src/commands/skills/renderers/skills.svg',
        },
      },
      {
        name: 'set-instructions',
        summary: 'Customize AI instructions for the active workspace.',
        textHidden: true,
        aliases: [],
        arguments: [
          {
            name: 'instructions',
            summary: 'Workspace AI instructions.',
            kind: 'string',
            choices: null,
            required: false,
            variadic: false,
            webInput: 'textarea',
          },
        ],
        options: [],
        examples: [`${prefix}skills set-instructions <instructions>`],
      },
      {
        name: 'reset-instructions',
        summary: 'Reset AI instructions for the active workspace.',
        textHidden: true,
        aliases: [],
        arguments: [],
        options: [],
        examples: [`${prefix}skills reset-instructions`],
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
      {
        name: 'tool-invocations',
        summary: 'Open remembered tool invocation rules.',
        textHidden: true,
        aliases: [],
        arguments: [],
        options: [],
        examples: [`${prefix}skills tool-invocations`],
      },
      {
        name: 'delete-tool-invocation',
        summary: 'Delete a remembered tool invocation rule.',
        textHidden: true,
        aliases: [],
        arguments: [
          {
            name: 'ruleId',
            summary: 'Tool invocation rule ID.',
            kind: 'string',
            choices: null,
            required: true,
            variadic: false,
          },
        ],
        options: [],
        examples: [],
      },
      {
        name: 'update-tool-invocation',
        summary: 'Update a remembered tool invocation pattern.',
        textHidden: true,
        aliases: [],
        arguments: [],
        options: [],
        examples: [],
      },
    ],
  };
}
