import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

export function getSkillsCommandDefinition(prefix: string): CommandDefinition {
  return {
    name: 'skills',
    summary: 'Manage AI instructions and skills for this workspace.',
    aliases: ['skill'],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'skills', {
        topicArgSummary:
          'Optional subcommand: manager, set, learn, save-custom, or delete-custom.',
        exampleTopics: ['manager', 'learn'],
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
        name: 'learn',
        summary:
          'Create or refine a custom skill with AI using optional session context.',
        textHidden: false,
        aliases: [],
        arguments: [
          {
            name: 'name',
            summary:
              'Custom skill name (e.g. relay-debug or custom-relay-debug).',
            kind: 'string',
            choices: null,
            required: true,
            variadic: false,
          },
          {
            name: 'instructions',
            summary:
              'Instructions on what the skill should teach or extract from the session.',
            kind: 'string',
            choices: null,
            required: false,
            variadic: true,
            webInput: 'textarea',
          },
        ],
        options: [
          {
            name: 'session',
            flag: '--session',
            shortFlag: '-s',
            summary:
              'Reference session ID (or "current" / "none") for context.',
            kind: 'string',
            choices: null,
            webDefaultValue: 'current',
            required: false,
            multiple: false,
          },
        ],
        examples: [
          `${prefix}skills learn relay-debug "Extract the relay debugging workflow from this session"`,
          `${prefix}skills learn relay-debug --session none "Always check NIP-11 relay info first"`,
        ],
      },
      {
        name: 'save-custom',
        summary: 'Save markdown for a custom skill.',
        textHidden: true,
        aliases: [],
        arguments: [
          {
            name: 'name',
            summary: 'Custom skill name.',
            kind: 'string',
            choices: null,
            required: true,
            variadic: false,
          },
          {
            name: 'markdown',
            summary: 'Full SKILL.md markdown content.',
            kind: 'string',
            choices: null,
            required: true,
            variadic: false,
            webInput: 'textarea',
          },
        ],
        options: [],
        examples: [],
      },
      {
        name: 'delete-custom',
        summary: 'Delete a custom skill.',
        textHidden: true,
        aliases: [],
        arguments: [
          {
            name: 'name',
            summary: 'Custom skill name.',
            kind: 'string',
            choices: null,
            required: true,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${prefix}skills delete-custom custom-relay-debug`],
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
