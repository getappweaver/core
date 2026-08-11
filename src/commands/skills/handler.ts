import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { buildOpenCodeActiveRuntimeContext } from '@src/backends/opencode-runtime-context';
import {
  getSelectedOpencodeAgent,
  getWorkspaceInstructions,
  getWorkspaceTarget,
  resetWorkspaceInstructions,
  setWorkspaceInstructions,
} from '@src/db';
import {
  listManagedSkills,
  setManagedSkillEnabled,
  type ManagedSkill,
} from '@src/skills/manager';
import type {
  WebAction,
  WebHandlerResult,
  WebNode,
  WebNodeRoot,
} from '@src/web/ui-schema';
import { stack, textBlock, textNode } from '@src/web/widgets';

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

const REFRESH = {
  command: 'skills',
  subcommand: 'manager',
  arguments: {},
  options: {},
  recordInTimeline: false,
} as const;

const REFRESH_SKILLS = {
  ...REFRESH,
  subcommand: 'list',
} as const;

function commandAction(subcommand: string): WebAction {
  return {
    type: 'command',
    command: 'skills',
    subcommand,
    arguments: {},
    options: {},
    refresh: REFRESH,
    recordInTimeline: false,
    pendingUi: { presentation: 'widget', label: 'Updating instructions...' },
  };
}

function toggleAction(skill: ManagedSkill): WebAction {
  return {
    type: 'command',
    command: 'skills',
    subcommand: 'set',
    arguments: {
      name: skill.name,
      status: skill.enabled ? 'disable' : 'enable',
    },
    options: {},
    refresh: REFRESH_SKILLS,
    recordInTimeline: false,
    pendingUi: { presentation: 'entity', label: 'Updating skill...' },
  };
}

function skillRow(skill: ManagedSkill): WebNode {
  return {
    type: 'element',
    tag: 'stack',
    props: {
      gap: 'xs',
      className: 'skills-manager-row',
      entityKey: `skill:${skill.name}`,
    },
    children: [
      {
        type: 'element',
        tag: 'text',
        props: { weight: 'bold', className: 'skills-manager-name' },
        children: [textNode(skill.name)],
      },
      ...(skill.description ? [textBlock(skill.description, 'muted')] : []),
      {
        type: 'element',
        tag: 'row',
        props: {
          gap: 'xs',
          itemAlign: 'center',
          className: 'skills-manager-toggle-row',
        },
        children: [
          {
            type: 'element',
            tag: 'checkbox',
            props: {
              checked: skill.enabled,
              ariaLabel: `${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`,
              title: `${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`,
              className: 'web-checkbox--retro skills-manager-checkbox',
              action: toggleAction(skill),
            },
          },
          {
            type: 'element',
            tag: 'text',
            props: {
              tone: 'muted',
              className: 'skills-manager-status',
            },
            children: [textNode(skill.enabled ? 'Enabled' : 'Disabled')],
          },
        ],
      },
    ],
  };
}

function renderSkillsManager(skills: ManagedSkill[]): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'skills', subcommand: 'manager' },
    stylesheets: [
      {
        id: 'skills-manager',
        cssText: `
          .web-stack.skills-manager-row {
            padding: 0.55rem 0;
            border-bottom: 1px solid color-mix(in srgb, var(--color-border, currentColor) 55%, transparent);
          }

          .web-stack.skills-manager-row:first-child {
            padding-top: 0;
          }

          .web-stack.skills-manager-row:last-child {
            padding-bottom: 0;
            border-bottom: 0;
          }

          .web-text.skills-manager-name {
            color: var(--color-warning);
          }

          .web-text.skills-manager-status {
            font-size: 0.82rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
        `.trim(),
      },
    ],
    tree:
      skills.length > 0
        ? stack(skills.map(skillRow), 'xs')
        : textBlock('No managed AppWeaver skills are installed.', 'muted'),
  };
}

function sectionTitle(label: string, status: string): WebNode {
  return {
    type: 'element',
    tag: 'row',
    props: { gap: 'sm', itemAlign: 'center' },
    children: [
      {
        type: 'element',
        tag: 'text',
        props: { weight: 'bold', className: 'instructions-section-title' },
        children: [textNode(label)],
      },
      {
        type: 'element',
        tag: 'badge',
        props: { label: status, tone: 'muted' },
      },
    ],
  };
}

function readAgentsMarkdown(cwd: string): string | null {
  const path = join(cwd, 'AGENTS.md');

  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

type RenderConfigurationManagerProps = {
  skills: ManagedSkill[];
  runtimeContext: string;
  workspace: 'parent' | 'appweaver';
  workspaceInstructions: string;
  customized: boolean;
  agentsMarkdown: string | null;
  defaultActiveTab: 'instructions' | 'skills';
};

function renderConfigurationManager({
  skills,
  runtimeContext,
  workspace,
  workspaceInstructions,
  customized,
  agentsMarkdown,
  defaultActiveTab,
}: RenderConfigurationManagerProps): WebHandlerResult {
  const skillsManager = renderSkillsManager(skills);

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'skills', subcommand: 'manager' },
    stylesheets: [
      ...(skillsManager.stylesheets ?? []),
      {
        id: 'instructions-manager',
        cssText: `
          .web-stack.instructions-section {
            padding: 0.35rem 0;
          }

          .web-text.instructions-section-title {
            color: var(--color-warning);
          }

          .web-box.instructions-preview {
            max-height: 14rem;
            overflow: auto;
            padding: 0.55rem;
            background: color-mix(in srgb, var(--color-bg, #000) 88%, var(--color-warning) 12%);
          }

          .web-box.instructions-preview .web-text {
            font-family: var(--font-mono, monospace);
            font-size: 0.82rem;
          }

          .web-textArea.instructions-editor textarea {
            min-height: 10rem;
            font-family: var(--font-mono, monospace);
          }
        `.trim(),
      },
    ],
    tree: {
      type: 'element',
      tag: 'tabs',
      props: { defaultActiveTabId: defaultActiveTab },
      children: [
        {
          type: 'element',
          tag: 'tabPanel',
          props: { id: 'instructions', label: 'Instructions' },
          children: [
            stack(
              [
                stack(
                  [
                    sectionTitle('Runtime Context', 'Read only'),
                    {
                      type: 'element',
                      tag: 'box',
                      props: { className: 'instructions-preview' },
                      children: [textBlock(runtimeContext)],
                    },
                  ],
                  'xs',
                ),
                {
                  type: 'element',
                  tag: 'form',
                  props: { action: commandAction('set-instructions') },
                  children: [
                    stack(
                      [
                        sectionTitle(
                          'Workspace Instructions',
                          customized ? 'Customized' : 'Default',
                        ),
                        textBlock(`Workspace: ${workspace}`, 'muted'),
                        {
                          type: 'element',
                          tag: 'textArea',
                          props: {
                            formFieldName: 'instructions',
                            value: workspaceInstructions,
                            maxRows: 18,
                            className: 'instructions-editor',
                          },
                        },
                        {
                          type: 'element',
                          tag: 'row',
                          props: { gap: 'sm', itemAlign: 'center' },
                          children: [
                            {
                              type: 'element',
                              tag: 'button',
                              props: {
                                label: 'Save',
                                tone: 'warning',
                                className: 'web-button',
                                htmlType: 'submit',
                              },
                            },
                            {
                              type: 'element',
                              tag: 'button',
                              props: {
                                label: 'Reset to default',
                                tone: 'muted',
                                className: 'web-button',
                                action: commandAction('reset-instructions'),
                              },
                            },
                          ],
                        },
                      ],
                      'xs',
                    ),
                  ],
                },
                stack(
                  [
                    sectionTitle(
                      'AGENTS.md',
                      agentsMarkdown === null ? 'Not found' : 'Read only',
                    ),
                    textBlock(
                      agentsMarkdown === null
                        ? 'No workspace AGENTS.md was found. AppWeaver does not create or edit this file.'
                        : 'Loaded separately by OpenCode. AppWeaver does not edit this file.',
                      'muted',
                    ),
                    ...(agentsMarkdown === null
                      ? []
                      : [
                          {
                            type: 'element' as const,
                            tag: 'box' as const,
                            props: { className: 'instructions-preview' },
                            children: [textBlock(agentsMarkdown)],
                          },
                        ]),
                  ],
                  'xs',
                ),
              ],
              'md',
            ),
          ],
        },
        {
          type: 'element',
          tag: 'tabPanel',
          props: { id: 'skills', label: 'Skills' },
          children: [skillsManager.tree],
        },
      ],
    },
  };
}

function instructionsFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const args = (payload as { arguments?: unknown }).arguments;

  if (typeof args !== 'object' || args === null) {
    return null;
  }

  const instructions = (args as { instructions?: unknown }).instructions;

  return typeof instructions === 'string' ? instructions : null;
}

export const handleSkillsRoot: BuiltinHandler = async (ctx) => {
  const sub = ctx.args[0]?.toLowerCase() ?? 'manager';

  if (sub === 'help') {
    return renderBuiltinHelpText({
      prefix: ctx.prefix,
      root: 'skills',
      topic: ctx.args[1]?.toLowerCase() ?? null,
    });
  }

  if (sub === 'manager' || sub === 'list') {
    return handleError(async () => {
      const workspace = getWorkspaceTarget(ctx.seenDb);

      const configuredInstructions = getWorkspaceInstructions(
        ctx.seenDb,
        workspace,
      );

      return renderConfigurationManager({
        skills: listManagedSkills({
          db: ctx.seenDb,
          dmBotRoot: ctx.dmBotRoot,
          workspaceRoot: ctx.cwd,
        }),
        runtimeContext: buildOpenCodeActiveRuntimeContext({
          backendName: 'opencode',
          agentName: getSelectedOpencodeAgent(ctx.seenDb),
          dmBotRoot: ctx.dmBotRoot,
          cwd: ctx.cwd,
        }),
        workspace,
        workspaceInstructions: configuredInstructions.instructions,
        customized: configuredInstructions.customized,
        agentsMarkdown: readAgentsMarkdown(ctx.cwd),
        defaultActiveTab: sub === 'list' ? 'skills' : 'instructions',
      });
    }, 'Failed to open AI configuration');
  }

  if (sub === 'set-instructions') {
    return handleError(async () => {
      const workspace = getWorkspaceTarget(ctx.seenDb);

      const instructions =
        instructionsFromPayload(ctx.jsonPayload) ?? ctx.args.slice(1).join(' ');

      setWorkspaceInstructions(ctx.seenDb, workspace, instructions);

      return `Instructions customized for the ${workspace} workspace.`;
    }, 'Failed to save workspace instructions');
  }

  if (sub === 'reset-instructions') {
    return handleError(async () => {
      const workspace = getWorkspaceTarget(ctx.seenDb);

      resetWorkspaceInstructions(ctx.seenDb, workspace);

      return `Instructions reset to the default for the ${workspace} workspace.`;
    }, 'Failed to reset workspace instructions');
  }

  if (sub === 'set') {
    return handleError(async () => {
      const skillName = ctx.args[1] ?? '';
      const status = ctx.args[2]?.toLowerCase();

      if (status !== 'enable' && status !== 'disable') {
        return `Usage: ${ctx.prefix}skills set <name> enable|disable`;
      }

      setManagedSkillEnabled({
        db: ctx.seenDb,
        dmBotRoot: ctx.dmBotRoot,
        workspaceRoot: ctx.cwd,
        skillName,
        enabled: status === 'enable',
      });

      return `${skillName} ${status === 'enable' ? 'enabled' : 'disabled'} for this workspace.`;
    }, 'Failed to update skill');
  }

  return `Usage: ${ctx.prefix}skills manager`;
};
