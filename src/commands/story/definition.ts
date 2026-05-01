import type { CommandDefinition } from '@src/system/command-definition';

export function getStoryCommandDefinition({
  prefix,
}: {
  prefix: string;
}): CommandDefinition {
  return {
    name: 'story',
    summary: 'List and start guided plugin walkthroughs.',
    aliases: [],
    subcommands: [
      {
        name: 'list',
        summary: 'List available stories.',
        aliases: [],
        arguments: [],
        options: [],
        examples: [`${prefix}story list`],
        webWidget: {
          placement: 'header',
          surface: 'timeline_singleton',
          label: 'Stories',
          modalTitle: 'Stories',
          icon: '/src/commands/story/renderers/help.svg',
          order: 40,
        },
      },
      {
        name: 'start',
        summary: 'Start a story by id.',
        aliases: [],
        arguments: [
          {
            name: 'id',
            summary: 'Story id.',
            kind: 'string',
            required: true,
          },
        ],
        options: [],
        webExecutionMode: 'runnable_default',
        examples: [`${prefix}story start todo-list-bootstrap`],
      },
    ],
  };
}
