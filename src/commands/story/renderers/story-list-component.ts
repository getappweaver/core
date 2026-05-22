import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { stack, textBlock, textNode } from '@src/web/widgets';

export type StoryListEntry = {
  id: string;
  pluginAlias: string;
  iconUrl: string | null;
  title: string;
  description: string | null;
};

export const storyListStylesheet = {
  id: 'story-list-web',
  cssText: `
    .web-stack.story-list-layout {
      gap: 0.75rem;
    }

    .web-box.story-list-card {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 92%, transparent);
      cursor: pointer;
      transition: background 140ms ease;
    }

    .web-box.story-list-card:hover,
    .web-box.story-list-card:focus-visible {
      background: color-mix(in srgb, var(--color-panel, #242424) 82%, var(--color-accent, currentColor));
    }

    .web-row.story-list-card-row {
      align-items: flex-start;
      flex-wrap: nowrap;
      gap: 0.75rem;
    }

    .web-box.story-list-icon-box {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      background: var(--color-accent, currentColor);
      color: #000;
    }

    .web-image.story-list-icon {
      width: 1.35rem;
      height: 1.35rem;
      object-fit: contain;
    }

    .web-stack.story-list-card-main {
      min-width: 0;
      flex: 1;
    }

    .web-row.story-list-title-row {
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
    }

  `,
} as const;

function badge(label: string): WebNode {
  return {
    type: 'element',
    tag: 'badge',
    props: { label, tone: 'muted', size: 'sm' },
  };
}

function storyStartAction(entry: StoryListEntry): WebAction {
  return {
    type: 'command',
    command: 'story',
    subcommand: 'start',
    arguments: { id: entry.id },
    options: {},
    recordInTimeline: false,
    surface: 'timeline',
  };
}

function storyListItem(entry: StoryListEntry): WebNode {
  const action = storyStartAction(entry);

  return {
    type: 'element',
    tag: 'box',
    props: { padding: 'md', className: 'story-list-card', action },
    children: [
      {
        type: 'element',
        tag: 'row',
        props: { gap: 'md', className: 'story-list-card-row' },
        children: [
          {
            type: 'element',
            tag: 'box',
            props: { className: 'story-list-icon-box' },
            children: entry.iconUrl
              ? [
                  {
                    type: 'element',
                    tag: 'image',
                    props: {
                      src: entry.iconUrl,
                      alt: '',
                      className: 'story-list-icon',
                    },
                  },
                ]
              : [textNode(entry.pluginAlias.slice(0, 2).toUpperCase())],
          },
          {
            type: 'element',
            tag: 'stack',
            props: {
              gap: 'sm',
              className: 'story-list-card-main',
            },
            children: [
              {
                type: 'element',
                tag: 'row',
                props: { gap: 'sm', className: 'story-list-title-row' },
                children: [
                  {
                    type: 'element',
                    tag: 'stack',
                    props: { gap: 'xs' },
                    children: [
                      {
                        type: 'element',
                        tag: 'text',
                        props: { weight: 'bold' },
                        children: [textNode(entry.title)],
                      },
                    ],
                  },
                  badge(entry.pluginAlias),
                ],
              },
              {
                type: 'element',
                tag: 'stack',
                props: { gap: 'xs' },
                children: [
                  {
                    type: 'element',
                    tag: 'text',
                    props: { tone: 'muted', whiteSpace: 'pre-wrap' },
                    children: [textNode(entry.description ?? entry.id)],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function renderStoryListRoot(stories: StoryListEntry[]): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'story', subcommand: 'list' },
    tree: stack(
      [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold' },
          children: [textNode('Available Stories')],
        },
        ...(stories.length === 0
          ? [textBlock('No stories are registered yet.', 'muted')]
          : stories.map(storyListItem)),
      ],
      'md',
    ),
    stylesheets: [storyListStylesheet],
  };
}
