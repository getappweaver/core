import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { buildOpenCodeActiveRuntimeContext } from '@src/backends/opencode-runtime-context';
import {
  deleteToolInvocationRule,
  getSelectedOpencodeAgent,
  getWorkspaceInstructions,
  getWorkspaceTarget,
  listToolInvocationRules,
  resetWorkspaceInstructions,
  setWorkspaceInstructions,
  type CoreDb,
  type ToolInvocationRule,
  updateToolInvocationRulePattern,
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

const REFRESH_TOOL_INVOCATIONS = {
  ...REFRESH,
  subcommand: 'tool-invocations',
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

function deleteToolInvocationAction(ruleId: string): WebAction {
  return {
    type: 'command',
    command: 'skills',
    subcommand: 'delete-tool-invocation',
    arguments: { ruleId },
    options: {},
    refresh: REFRESH_TOOL_INVOCATIONS,
    recordInTimeline: false,
    pendingUi: { presentation: 'entity', label: 'Removing rule...' },
  };
}

function toolInvocationRow(rule: ToolInvocationRule): WebNode {
  const patternFieldName = `pattern-${rule.id}`;

  const actionLabel =
    rule.phase === 'after' && rule.action === 'send'
      ? 'auto send the output for'
      : rule.action === 'continue'
        ? 'auto continue for'
        : rule.phase === 'before'
          ? 'auto stop before'
          : 'auto stop after running';

  const argumentLabel =
    rule.argumentKey === '$file' ? 'file' : rule.argumentKey;

  return {
    type: 'element',
    tag: 'stack',
    props: {
      gap: 'xs',
      className: 'tool-invocations-row',
      entityKey: `tool-invocation:${rule.id}`,
    },
    children: [
      ...(rule.argumentKey && rule.pattern
        ? [
            {
              type: 'element' as const,
              tag: 'form' as const,
              props: {
                action: {
                  type: 'command' as const,
                  command: 'skills',
                  subcommand: 'update-tool-invocation',
                  arguments: { ruleId: rule.id },
                  options: {},
                  refresh: REFRESH_TOOL_INVOCATIONS,
                  recordInTimeline: false,
                },
              },
              children: [
                {
                  type: 'element' as const,
                  tag: 'row' as const,
                  props: {
                    gap: 'sm' as const,
                    itemAlign: 'center' as const,
                    className: 'tool-invocations-rule-line',
                  },
                  children: [
                    {
                      type: 'element' as const,
                      tag: 'text' as const,
                      props: {
                        weight: 'bold' as const,
                        className: 'tool-invocations-name',
                      },
                      children: [textNode(`${rule.tool}:`)],
                    },
                    textBlock(actionLabel, 'muted'),
                    textBlock(`${argumentLabel}:`, 'muted'),
                    {
                      type: 'element' as const,
                      tag: 'textField' as const,
                      props: {
                        formFieldName: patternFieldName,
                        value: rule.pattern,
                        className: 'tool-intervention__rule-pattern',
                        ariaLabel: `${rule.tool} ${rule.argumentKey} pattern`,
                      },
                    },
                    {
                      type: 'element' as const,
                      tag: 'button' as const,
                      props: {
                        label: 'Save',
                        tone: 'warning' as const,
                        className: 'web-button',
                        htmlType: 'submit' as const,
                        disabledUntilFormFieldChanged: patternFieldName,
                      },
                    },
                    {
                      type: 'element' as const,
                      tag: 'button' as const,
                      props: {
                        label: 'Remove',
                        tone: 'danger' as const,
                        className: 'web-button',
                        action: deleteToolInvocationAction(rule.id),
                      },
                    },
                  ],
                },
              ],
            },
          ]
        : [
            {
              type: 'element' as const,
              tag: 'row' as const,
              props: { gap: 'sm' as const, itemAlign: 'center' as const },
              children: [
                {
                  type: 'element' as const,
                  tag: 'text' as const,
                  props: {
                    weight: 'bold' as const,
                    className: 'tool-invocations-name',
                  },
                  children: [textNode(`${rule.tool}:`)],
                },
                textBlock(actionLabel, 'muted'),
              ],
            },
            {
              type: 'element' as const,
              tag: 'box' as const,
              props: { className: 'tool-invocations-args' },
              children: [textBlock(JSON.stringify(rule.args, null, 2))],
            },
            {
              type: 'element' as const,
              tag: 'button' as const,
              props: {
                label: 'Remove',
                tone: 'danger' as const,
                className: 'web-button',
                action: deleteToolInvocationAction(rule.id),
              },
            },
          ]),
    ],
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
  seenDb: CoreDb;
  skills: ManagedSkill[];
  runtimeContext: string;
  workspace: 'parent' | 'appweaver';
  workspaceInstructions: string;
  customized: boolean;
  agentsMarkdown: string | null;
  defaultActiveTab: 'instructions' | 'skills' | 'tool-invocations';
};

function renderConfigurationManager({
  seenDb,
  skills,
  runtimeContext,
  workspace,
  workspaceInstructions,
  customized,
  agentsMarkdown,
  defaultActiveTab,
}: RenderConfigurationManagerProps): WebHandlerResult {
  const skillsManager = renderSkillsManager(skills);
  const invocationRules = listToolInvocationRules(seenDb);

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

          .web-stack.tool-invocations-row {
            padding: 0.55rem 0;
            border-bottom: 1px solid color-mix(in srgb, var(--color-border, currentColor) 55%, transparent);
          }

          .web-text.tool-invocations-name {
            color: var(--color-warning);
          }

          .web-row.tool-invocations-rule-line {
            flex-wrap: wrap;
          }

          .web-textField.tool-intervention__rule-pattern {
            flex: 1 1 12rem;
            min-width: 8rem;
          }

          .web-textField.tool-intervention__rule-pattern input {
            width: 100%;
            border: 0;
            border-radius: 0;
            background: #000;
            color: var(--color-warning);
            padding: 0.3rem 0.4rem;
            font-family: var(--font-mono, monospace);
          }

          .web-box.tool-invocations-args {
            max-height: 8rem;
            overflow: auto;
            padding: 0.45rem;
            background: color-mix(in srgb, var(--color-bg, #000) 90%, var(--color-warning) 10%);
          }

          .web-box.tool-invocations-args .web-text {
            white-space: pre-wrap;
            font-family: var(--font-mono, monospace);
            font-size: 0.78rem;
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
        {
          type: 'element',
          tag: 'tabPanel',
          props: { id: 'tool-invocations', label: 'Tool Invocations' },
          children: [
            invocationRules.length > 0
              ? stack(invocationRules.map(toolInvocationRow), 'xs')
              : textBlock('No remembered tool invocation rules.', 'muted'),
          ],
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

  if (sub === 'manager' || sub === 'list' || sub === 'tool-invocations') {
    return handleError(async () => {
      const workspace = getWorkspaceTarget(ctx.seenDb);

      const configuredInstructions = getWorkspaceInstructions(
        ctx.seenDb,
        workspace,
      );

      return renderConfigurationManager({
        seenDb: ctx.seenDb,
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
        defaultActiveTab:
          sub === 'list'
            ? 'skills'
            : sub === 'tool-invocations'
              ? 'tool-invocations'
              : 'instructions',
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

  if (sub === 'delete-tool-invocation') {
    const ruleId =
      ctx.jsonPayload && typeof ctx.jsonPayload === 'object'
        ? (ctx.jsonPayload as { arguments?: { ruleId?: unknown } }).arguments
            ?.ruleId
        : null;

    if (
      typeof ruleId !== 'string' ||
      !deleteToolInvocationRule(ctx.seenDb, ruleId)
    ) {
      return 'Tool invocation rule not found.';
    }

    return 'Tool invocation rule removed.';
  }

  if (sub === 'update-tool-invocation') {
    const args =
      ctx.jsonPayload && typeof ctx.jsonPayload === 'object'
        ? (ctx.jsonPayload as { arguments?: Record<string, unknown> }).arguments
        : null;

    const ruleId = typeof args?.ruleId === 'string' ? args.ruleId : null;

    const patternEntry = Object.entries(args ?? {}).find(([key]) =>
      key.startsWith('pattern-'),
    );

    const pattern =
      typeof patternEntry?.[1] === 'string' ? patternEntry[1].trim() : '';

    if (
      !ruleId ||
      !pattern ||
      !updateToolInvocationRulePattern({
        db: ctx.seenDb,
        ruleId,
        pattern,
      })
    ) {
      return 'Tool invocation rule not found or pattern is empty.';
    }

    return 'Tool invocation rule updated.';
  }

  return `Usage: ${ctx.prefix}skills manager`;
};
