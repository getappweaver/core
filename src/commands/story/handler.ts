import { getStory, listStories } from '@src/stories/registry';

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import { renderStoryListWeb, renderStoryStartWeb } from './renderers/web';

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
      async () => renderStoryListWeb(listStories(ctx.prefix)),
      'Failed to list stories',
    );
  }

  if (sub === 'start') {
    return handleError(async () => {
      const storyId = ctx.args[1];

      if (!storyId) {
        return `Usage: ${ctx.prefix}story start <story-id>`;
      }

      const story = getStory(ctx.prefix, storyId);

      if (!story) {
        return `Unknown story: ${storyId}`;
      }

      return renderStoryStartWeb(story);
    }, 'Failed to start story');
  }

  return Promise.resolve(
    `Unknown story command: ${sub}. Try ${ctx.prefix}story list`,
  );
};
