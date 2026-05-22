import { readFileSync } from 'fs';
import { join } from 'path';

import { isDemoMode } from '@src/demo-mode';
import type { RegisteredStory } from '@src/stories/registry';
import { getStory, listStories } from '@src/stories/registry';
import type { StoryDefinition } from '@src/system/story-definition';

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import { renderStoryListWeb, renderStoryStartWeb } from './renderers/web';

type DemoStoryEntry = {
  pluginAlias: string;
  pluginName: string;
  iconUrl?: string;
  story: StoryDefinition<unknown>;
};

function loadDemoStories(dmBotRoot: string): RegisteredStory[] {
  const filePath = join(dmBotRoot, 'web', 'public', 'demo', 'stories.json');

  const entries = JSON.parse(
    readFileSync(filePath, 'utf8'),
  ) as DemoStoryEntry[];

  return entries
    .map((entry) => ({
      id: entry.story.id,
      pluginAlias: entry.pluginAlias,
      pluginName: entry.pluginName,
      iconUrl: entry.iconUrl,
      story: entry.story,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function listAvailableStories(
  ctx: Parameters<BuiltinHandler>[0],
): RegisteredStory[] {
  return isDemoMode()
    ? loadDemoStories(ctx.dmBotRoot)
    : listStories(ctx.prefix);
}

function getAvailableStory(
  ctx: Parameters<BuiltinHandler>[0],
  storyId: string,
): RegisteredStory | null {
  if (isDemoMode()) {
    return (
      loadDemoStories(ctx.dmBotRoot).find((story) => story.id === storyId) ??
      null
    );
  }

  return getStory(ctx.prefix, storyId);
}

export const handleStoryRoot: BuiltinHandler = (ctx) => {
  const sub = ctx.args[0]?.toLowerCase() ?? 'list';

  if (sub === 'help') {
    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: ctx.prefix,
        root: 'story',
        topic: ctx.args[1]?.toLowerCase() ?? null,
      }),
    );
  }

  if (sub === 'list') {
    return handleError(
      async () => renderStoryListWeb(listAvailableStories(ctx)),
      'Failed to list stories',
    );
  }

  if (sub === 'start') {
    return handleError(async () => {
      const storyId = ctx.args[1];

      if (!storyId) {
        return `Usage: ${ctx.prefix}story start <story-id>`;
      }

      const story = getAvailableStory(ctx, storyId);

      if (!story) {
        return `Unknown story: ${storyId}`;
      }

      return renderStoryStartWeb(story, {
        walkthrough: isDemoMode() ? false : undefined,
      });
    }, 'Failed to start story');
  }

  return Promise.resolve(
    `Unknown story command: ${sub}. Try ${ctx.prefix}story list`,
  );
};
