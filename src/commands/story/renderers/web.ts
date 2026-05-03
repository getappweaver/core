import type { RegisteredStory } from '@src/stories/registry';
import type { StoryStep } from '@src/system/story-definition';
import type {
  ClientViewRoot,
  WebAction,
  WebNode,
  WebNodeRoot,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

const storyListStylesheet = {
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

function button(params: {
  label: string;
  command: string;
  subcommand: string;
  args: Record<string, unknown>;
  options: Record<string, unknown>;
}): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: {
      label: params.label,
      action: {
        type: 'command',
        command: params.command,
        subcommand: params.subcommand,
        arguments: params.args,
        options: params.options,
        recordInTimeline: false,
        surface: 'timeline',
      },
    },
  };
}

function storyStartAction(entry: RegisteredStory): WebAction {
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

function storyListItem(entry: RegisteredStory): WebNode {
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
                    props: {
                      gap: 'xs',
                    },
                    children: [
                      {
                        type: 'element',
                        tag: 'text',
                        props: {
                          weight: 'bold',
                        },
                        children: [textNode(entry.story.title)],
                      },
                    ],
                  },
                  badge(entry.pluginAlias),
                ],
              },
              {
                type: 'element',
                tag: 'stack',
                props: {
                  gap: 'xs',
                },
                children: [
                  {
                    type: 'element',
                    tag: 'text',
                    props: {
                      tone: 'muted',
                      whiteSpace: 'pre-wrap',
                    },
                    children: [textNode(entry.story.description ?? entry.id)],
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

export function renderStoryListWeb(stories: RegisteredStory[]): WebNodeRoot {
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

function renderStep(step: StoryStep<unknown>, index: number): WebNode {
  const label = `${index + 1}. ${step.type}`;

  if (step.type === 'instruction') {
    return textBlock(`${label}\n${step.text}`);
  }

  if (step.type === 'seed_sandbox') {
    return textBlock(`${label}\nPrepare deterministic story data.`, 'muted');
  }

  if (step.type === 'focus_target') {
    if (step.target.type === 'header_widget') {
      return textBlock(
        `${label}\nFocus header widget /${step.target.command} ${step.target.subcommand}.`,
        'muted',
      );
    }

    if (step.target.type === 'web_node_action') {
      return textBlock(
        `${label}\nFocus /${step.target.command} ${step.target.subcommand} action.`,
        'muted',
      );
    }

    return textBlock(`${label}\nFocus node ${step.target.targetId}.`, 'muted');
  }

  if (step.type === 'wait_for_action') {
    if (step.match.type === 'widget_opened') {
      return textBlock(
        `${label}\nWait for /${step.match.command} ${step.match.subcommand} widget to open.`,
        'muted',
      );
    }

    if (step.match.type === 'web_action') {
      return textBlock(
        `${label}\nWait for /${step.match.command} ${step.match.subcommand} action.`,
        'muted',
      );
    }

    if (step.match.type === 'command_completed') {
      return textBlock(
        `${label}\nWait for /${step.match.command} ${step.match.subcommand} command to complete.`,
        'muted',
      );
    }

    if (step.match.type === 'target_clicked') {
      return textBlock(
        `${label}\nWait for the highlighted control to be clicked.`,
        'muted',
      );
    }

    if (step.match.type === 'target_hovered') {
      return textBlock(
        `${label}\nWait for the highlighted control to be hovered.`,
        'muted',
      );
    }
  }

  if (step.type === 'fill_form') {
    return textBlock(
      `${label}\nFill the current form with story values.`,
      'muted',
    );
  }

  if (step.type === 'complete') {
    return textBlock(`${label}\nStory complete.`, 'muted');
  }

  if (step.type === 'user_message') {
    return textBlock(`${label}\n${step.text}`);
  }

  if (step.type === 'assistant_message') {
    return textBlock(`${label}\n${step.text}`, 'muted');
  }

  if (step.type === 'tool_activity') {
    return textBlock(
      `${label}\n${step.label}${step.detail ? `: ${step.detail}` : ''}`,
      'muted',
    );
  }

  if (step.type === 'run_command') {
    return {
      type: 'element',
      tag: 'box',
      props: { padding: 'sm' },
      children: [
        textBlock(`${label}\n/${step.command} ${step.subcommand}`, 'muted'),
        button({
          label: `Run /${step.command} ${step.subcommand}`,
          command: step.command,
          subcommand: step.subcommand,
          args: step.payload.arguments,
          options: step.payload.options,
        }),
      ],
    };
  }

  if (step.type === 'choice') {
    return textBlock(`${label}\n${step.prompt}`, 'muted');
  }

  return textBlock(label, 'muted');
}

export function renderStoryStartWeb(
  entry: RegisteredStory,
  options?: { walkthrough?: boolean; initialStepIndex?: number },
): ClientViewRoot {
  return {
    kind: 'client_view',
    version: 1,
    view: 'story-runtime',
    meta: { command: 'story', subcommand: 'start' },
    payload: {
      ...entry,
      autoStart: true,
      walkthrough: options?.walkthrough,
      initialStepIndex: options?.initialStepIndex,
    },
  };
}

export function renderStoryStartStaticWeb(entry: RegisteredStory): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'story', subcommand: 'start' },
    tree: stack([
      row([badge(entry.pluginAlias), badge(entry.id)]),
      {
        type: 'element',
        tag: 'text',
        props: { weight: 'bold' },
        children: [textNode(entry.story.title)],
      },
      textBlock(entry.story.description ?? 'Follow the steps below.', 'muted'),
      ...entry.story.steps.map(renderStep),
    ]),
  };
}
