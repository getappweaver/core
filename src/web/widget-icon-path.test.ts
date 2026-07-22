import { describe, expect, test } from 'bun:test';

import {
  localWidgetIconSourceReference,
  publishedWidgetIconPath,
} from './widget-icon-path';

describe('widget icon paths', () => {
  test('normalizes current-directory plugin icon references', () => {
    const props = {
      icon: './commands/list/renderers/list.svg',
      pluginAlias: 'nr',
    };

    expect(localWidgetIconSourceReference(props)).toBe(
      '/plugins/nr/commands/list/renderers/list.svg',
    );

    expect(publishedWidgetIconPath(props)).toBe(
      'plugin-icons/nr/commands__list__renderers__list.svg',
    );
  });

  test('normalizes current-directory segments in rooted plugin paths', () => {
    expect(
      publishedWidgetIconPath({
        icon: '/plugins/nr/./commands/list/renderers/list.svg',
        pluginAlias: 'nr',
      }),
    ).toBe('plugin-icons/nr/commands__list__renderers__list.svg');
  });
});
