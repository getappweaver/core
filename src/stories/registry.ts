import type { BotPlugin } from '@src/core/plugin';
import { listRegisteredPlugins } from '@src/core/registry';
import type { CommandDefinition } from '@src/system/command-definition';
import type { StoryDefinition } from '@src/system/story-definition';
import {
  isRemoteWidgetIcon,
  publishedWidgetIconPath,
} from '@src/web/widget-icon-path';

export type RegisteredStory = {
  id: string;
  pluginAlias: string;
  pluginName: string;
  iconUrl?: string;
  story: StoryDefinition<unknown>;
};

function publishedIconUrl(params: {
  icon: string | undefined;
  pluginAlias: string;
}): string | undefined {
  const raw = params.icon?.trim();

  if (!raw) {
    return undefined;
  }

  if (isRemoteWidgetIcon(raw)) {
    return raw;
  }

  const path = publishedWidgetIconPath({
    icon: raw,
    pluginAlias: params.pluginAlias,
  });

  return path ? `/${path}` : undefined;
}

function resolvePluginDefinition(plugin: BotPlugin): CommandDefinition | null {
  if (!plugin.commandDefinition) {
    return null;
  }

  return typeof plugin.commandDefinition === 'function'
    ? plugin.commandDefinition('/', plugin.identity.alias)
    : plugin.commandDefinition;
}

function storyWidgetIconUrl(params: {
  plugin: BotPlugin;
  story: StoryDefinition<unknown>;
}): string | undefined {
  const target = params.story.steps.find(
    (step) =>
      step.type === 'focus_target' && step.target.type === 'header_widget',
  );

  const definition = resolvePluginDefinition(params.plugin);

  const fallbackSubcommand = definition?.subcommands.find(
    (item) => item.name === 'tree' && item.webWidget?.icon,
  );

  if (
    !target ||
    target.type !== 'focus_target' ||
    target.target.type !== 'header_widget'
  ) {
    return publishedIconUrl({
      icon: fallbackSubcommand?.webWidget?.icon,
      pluginAlias: params.plugin.identity.alias,
    });
  }

  const storyTarget = target.target;

  const subcommand = definition?.subcommands.find(
    (item) => item.name === storyTarget.subcommand,
  );

  return publishedIconUrl({
    icon: subcommand?.webWidget?.icon ?? fallbackSubcommand?.webWidget?.icon,
    pluginAlias: params.plugin.identity.alias,
  });
}

function pluginStories(prefix: string): RegisteredStory[] {
  const out: RegisteredStory[] = [];

  for (const plugin of listRegisteredPlugins()) {
    const stories = plugin.stories
      ? typeof plugin.stories === 'function'
        ? plugin.stories(prefix, plugin.identity.alias)
        : plugin.stories
      : [];

    for (const story of stories) {
      out.push({
        id: story.id,
        pluginAlias: plugin.identity.alias,
        pluginName: plugin.identity.name,
        iconUrl: storyWidgetIconUrl({ plugin, story }),
        story,
      });
    }
  }

  return out;
}

export function listStories(prefix: string): RegisteredStory[] {
  return pluginStories(prefix).sort((a, b) => a.id.localeCompare(b.id));
}

export function getStory(
  prefix: string,
  storyId: string,
): RegisteredStory | null {
  return listStories(prefix).find((entry) => entry.id === storyId) ?? null;
}
