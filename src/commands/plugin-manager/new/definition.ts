import type { SubcommandDefinition } from '@src/system/command-definition';

export function getPluginsNewSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'new',
    summary: 'Create a local plugin from the AppWeaver template.',
    aliases: ['create'],
    arguments: [],
    options: [
      {
        name: 'alias',
        summary: 'Lowercase local plugin alias.',
        flag: '--alias',
        shortFlag: null,
        kind: 'string',
        required: false,
      },
      {
        name: 'title',
        summary: 'Human-readable plugin title.',
        flag: '--title',
        shortFlag: null,
        kind: 'string',
        required: false,
      },
      {
        name: 'description',
        summary: 'Product brief and initial package description.',
        flag: '--description',
        shortFlag: null,
        kind: 'string',
        required: false,
      },
      {
        name: 'core',
        summary: 'Compatible AppWeaver core API range.',
        flag: '--core',
        shortFlag: null,
        kind: 'string',
        required: false,
      },
      {
        name: 'create_draft_commands',
        summary:
          'Include draft and review commands with supporting storage (enabled by default).',
        flag: '--create-draft-commands',
        shortFlag: null,
        kind: 'boolean',
        required: false,
        webDefaultValue: true,
      },
      {
        name: 'configure_git_hooks',
        summary:
          'Configure AppWeaver Git hooks for this repository (off by default). Does not run hooks during creation.',
        flag: '--configure-git-hooks',
        shortFlag: null,
        kind: 'boolean',
        required: false,
        webDefaultValue: false,
      },
    ],
    examples: [
      `${prefix}plugins new`,
      `${prefix}plugins new --alias reminder --title "Reminder app" --description "Manage reminders"`,
      `${prefix}plugins new --alias reminder --configure-git-hooks`,
      `${prefix}plugins new --alias reminder --configure-git-hooks true`,
      `${prefix}plugins new --alias reminder --configure-git-hooks false`,
      `${prefix}plugins new --alias reminder --create-draft-commands false`,
      `${prefix}plugins new --alias reminder --no-create-draft-commands`,
    ],
  };
}
