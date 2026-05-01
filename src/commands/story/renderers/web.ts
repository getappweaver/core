import type { RegisteredStory } from '@src/stories/registry';
import type { StoryStep } from '@src/system/story-definition';
import type { ClientViewRoot, WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

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

function storyListItem(entry: RegisteredStory): WebNode {
  return {
    type: 'element',
    tag: 'box',
    props: { padding: 'md' },
    children: [
      stack([
        row([
          {
            type: 'element',
            tag: 'text',
            props: { weight: 'bold' },
            children: [textNode(entry.story.title)],
          },
          badge(entry.pluginAlias),
        ]),
        textBlock(entry.story.description ?? entry.id, 'muted'),
        row([
          button({
            label: 'Start',
            command: 'story',
            subcommand: 'start',
            args: { id: entry.id },
            options: {},
          }),
        ]),
      ]),
    ],
  };
}

export function renderStoryListWeb(stories: RegisteredStory[]): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'story', subcommand: 'list' },
    tree: stack([
      {
        type: 'element',
        tag: 'text',
        props: { weight: 'bold' },
        children: [textNode('Available Stories')],
      },
      ...(stories.length === 0
        ? [textBlock('No stories are registered yet.', 'muted')]
        : stories.map(storyListItem)),
    ]),
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
