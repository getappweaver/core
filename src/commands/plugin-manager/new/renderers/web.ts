import type { WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { textBlock, textNode } from '@src/web/widgets';

export type PluginsNewFormRepresentation = {
  view: 'form';
  coreApiVersion: string;
};

export type PluginsNewCreatedRepresentation = {
  view: 'created';
  alias: string;
  title: string;
  description: string;
  pluginPath: string;
  repo: string;
};

export type PluginsNewRepresentation =
  PluginsNewFormRepresentation | PluginsNewCreatedRepresentation;

const stylesheet = {
  id: 'plugins-new-web',
  cssText: `
    .web-box.plugins-new-panel {
      border: 1px solid var(--color-border, currentColor);
      background: color-mix(in srgb, var(--color-panel, #242424) 94%, transparent);
    }

    .web-form.plugins-new-form,
    .web-stack.plugins-new-layout {
      gap: 0.6rem;
    }

    .web-row.plugins-new-actions {
      align-items: center;
      gap: 0.45rem;
      flex-wrap: wrap;
    }
  `,
} as const;

function fieldLabel(label: string): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: { weight: 'semibold' },
    children: [textNode(label)],
  };
}

function formView(coreApiVersion: string): WebNode {
  return {
    type: 'element',
    tag: 'form',
    props: {
      className: 'web-form plugins-new-form',
      formOptionFieldNames: ['alias', 'title', 'description', 'core'],
      action: {
        type: 'command',
        command: 'plugins',
        subcommand: 'new',
        arguments: {},
        options: {},
        recordInTimeline: false,
        pendingUi: { presentation: 'widget', label: 'Creating plugin...' },
      },
    },
    children: [
      fieldLabel('Alias'),
      {
        type: 'element',
        tag: 'textField',
        props: {
          formFieldName: 'alias',
          inputPlaceholder: 'reminder',
          autoFocus: true,
        },
      },
      fieldLabel('Title'),
      {
        type: 'element',
        tag: 'textField',
        props: {
          formFieldName: 'title',
          inputPlaceholder: 'Reminder app',
        },
      },
      fieldLabel('What should this app do?'),
      {
        type: 'element',
        tag: 'textArea',
        props: {
          formFieldName: 'description',
          inputPlaceholder:
            'Describe the user problem, expected behavior, and important constraints.',
          maxRows: 8,
        },
      },
      fieldLabel('Core API version'),
      {
        type: 'element',
        tag: 'textField',
        props: { formFieldName: 'core', value: coreApiVersion },
      },
      {
        type: 'element',
        tag: 'button',
        props: {
          label: 'Create local app',
          className: 'web-button',
          tone: 'warning',
          htmlType: 'submit',
        },
      },
    ],
  };
}

function createdView(representation: PluginsNewCreatedRepresentation): WebNode {
  const developmentPrompt = [
    `Develop the new AppWeaver plugin at ${representation.pluginPath}.`,
    `Read ${representation.pluginPath}/AGENTS.md and ${representation.pluginPath}/__BOTTOMUP.md before changing it.`,
    `Product goal: ${representation.description}`,
    'Inspect the generated scaffold, ask focused product questions when needed, and implement the app end-to-end while preserving the draft/review conventions.',
  ].join('\n\n');

  return {
    type: 'element',
    tag: 'stack',
    props: { className: 'plugins-new-layout' },
    children: [
      {
        type: 'element',
        tag: 'row',
        props: { gap: 'sm', itemAlign: 'center' },
        children: [
          {
            type: 'element',
            tag: 'text',
            props: { weight: 'bold' },
            children: [textNode(representation.title)],
          },
          {
            type: 'element',
            tag: 'badge',
            props: { label: 'local draft', tone: 'warning', size: 'sm' },
          },
        ],
      },
      textBlock(`Created ${representation.pluginPath}`, 'muted'),
      textBlock(
        'The template AGENTS.md was preserved, the nested Git repository was initialized, and plugin registration was generated.',
        'muted',
      ),
      {
        type: 'element',
        tag: 'row',
        props: { className: 'plugins-new-actions' },
        children: [
          {
            type: 'element',
            tag: 'button',
            props: {
              label: 'Develop with AI',
              className: 'web-button',
              tone: 'warning',
              action: {
                type: 'agentPrompt',
                prompt: developmentPrompt,
                recordInTimeline: true,
              },
            },
          },
          {
            type: 'element',
            tag: 'button',
            props: {
              label: 'Release status',
              className: 'web-button',
              action: {
                type: 'command',
                command: 'plugins',
                subcommand: 'releases',
                arguments: {},
                options: {},
                recordInTimeline: false,
              },
            },
          },
        ],
      },
    ],
  };
}

export function renderPluginsNewWeb(
  representation: PluginsNewRepresentation,
): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'plugins', subcommand: 'new' },
    tree: {
      type: 'element',
      tag: 'box',
      props: { padding: 'md', className: 'plugins-new-panel' },
      children: [
        representation.view === 'form'
          ? formView(representation.coreApiVersion)
          : createdView(representation),
      ],
    },
    stylesheets: [stylesheet],
  };
}
