import type { SubcommandDefinition } from '@src/system/command-definition';

export function getPluginsInstallSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'install',
    summary: 'Discover installable plugins from the Nostr plugin catalog.',
    aliases: ['list'],
    arguments: [],
    options: [],
    examples: [`${prefix}plugins install`],
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
