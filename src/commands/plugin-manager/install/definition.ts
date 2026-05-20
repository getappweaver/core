import type { SubcommandDefinition } from '@src/system/command-definition';

export function getPluginsInstallSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'install',
    summary: 'Discover or install plugins from the Nostr plugin catalog.',
    aliases: ['list'],
    arguments: [
      {
        name: 'target',
        summary: 'Optional plugin event id, package name, or title to install.',
        kind: 'string',
        required: false,
        variadic: false,
        choices: null,
      },
    ],
    options: [],
    examples: [
      `${prefix}plugins install`,
      `${prefix}plugins install appweaver-todo-plugin`,
    ],
    webWidget: {
      placement: 'header',
      surface: 'timeline_singleton',
      label: 'Plugins',
      modalTitle: 'Plugin installer',
      icon: '/src/commands/plugin-manager/install/renderers/plugins.svg',
      order: 15,
    },
  };
}
