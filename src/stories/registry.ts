import { listRegisteredPlugins } from '@src/core/registry';
import type { StoryDefinition } from '@src/system/story-definition';

export type RegisteredStory = {
  id: string;
  pluginAlias: string;
  pluginName: string;
  story: StoryDefinition<unknown>;
};

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
