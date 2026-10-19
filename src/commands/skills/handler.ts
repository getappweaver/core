import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { buildActiveRuntimeContext } from '@src/backends/agent-runtime-context';
import { getMessageOutput } from '@src/backends/types';
import { createPluginAgentService } from '@src/core/plugin-agent';
import {
  deleteToolInvocationRule,
  getState,
  getWorkspaceInstructions,
  getWorkspaceTarget,
  listToolInvocationRules,
  resetWorkspaceInstructions,
  setWorkspaceInstructions,
  STATE_CURRENT_SESSION,
  type CoreDb,
  type ToolInvocationRule,
  type WorkspaceTarget,
  updateToolInvocationRulePattern,
  webSessionStateKey,
} from '@src/db';
import {
  deleteCustomSkill,
  getCustomSkill,
  listManagedSkills,
  normalizeCustomSkillName,
  setManagedSkillEnabled,
  upsertCustomSkill,
  type ManagedSkill,
} from '@src/skills/manager';
import type {
  WebAction,
  WebHandlerResult,
  WebNode,
  WebNodeRoot,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

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

type SkillSessionChoices = {
  choices: string[];
  choiceLabels: Record<string, string>;
};

type BuildSkillSessionChoicesProps = {
  db: CoreDb;
  workspace: WorkspaceTarget;
  currentSessionId: string | null;
};

type ResolveSkillReferenceTranscriptProps = {
  db: CoreDb;
  workspace: WorkspaceTarget;
  sessionSelector: string;
  currentSessionId: string | null;
};

type SkillReferenceTranscript = {
  sessionId: string;
  sessionLabel: string;
  transcript: string;
};

type BuildSkillLearnPromptProps = {
  skillName: string;
  instructions: string;
  currentDraftMarkdown: string;
  conversation: SkillDraftTurn[];
  reference: SkillReferenceTranscript | null;
};

type SkillDraftTurn = {
  role: 'user' | 'assistant';
  content: string;
};

type SkillDraftSession = {
  skillName: string;
  sessionSelector: string;
  messages: SkillDraftTurn[];
  draftMarkdown: string;
  dirty: boolean;
  revision: number;
  statusMessage: string | null;
};

type RenderSkillLearnCardProps = {
  draft: SkillDraftSession;
  savedSkill: { description: string; markdown: string } | null;
  sessionChoices: SkillSessionChoices;
};

const skillDraftSessions = new Map<string, SkillDraftSession>();

function defaultSkillMarkdownTemplate(skillName: string): string {
  const title = skillName
    .replace(/^custom-/, '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return [
    '---',
    `name: ${skillName}`,
    `description: Reusable instructions and workflow for ${title || skillName}.`,
    '---',
    '',
    `# ${title || skillName}`,
    '',
    'Describe when to use this skill and the step-by-step instructions.',
  ].join('\n');
}

function getOrCreateSkillDraftSession(props: {
  workspace: WorkspaceTarget;
  skillName: string;
  existingMarkdown: string | null;
  sessionSelector: string | null;
}): SkillDraftSession {
  const key = `${props.workspace}:${props.skillName}`;
  const existingDraft = skillDraftSessions.get(key);

  if (existingDraft) {
    if (props.sessionSelector) {
      existingDraft.sessionSelector = props.sessionSelector;
    }

    if (!existingDraft.dirty && props.existingMarkdown !== null) {
      existingDraft.draftMarkdown = props.existingMarkdown;
    }

    return existingDraft;
  }

  const created: SkillDraftSession = {
    skillName: props.skillName,
    sessionSelector: props.sessionSelector ?? 'current',
    messages: [],
    draftMarkdown:
      props.existingMarkdown ?? defaultSkillMarkdownTemplate(props.skillName),
    dirty: false,
    revision: 1,
    statusMessage: null,
  };

  skillDraftSessions.set(key, created);

  return created;
}

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

function openLearnSkillTimelineAction(skillName: string | null): WebAction {
  return {
    type: 'command',
    command: 'skills',
    subcommand: 'learn',
    arguments: skillName ? { name: skillName } : {},
    options: { mode: 'open' },
    recordInTimeline: false,
    surface: 'timeline',
    pendingUi: {
      presentation: skillName ? 'entity' : 'widget',
      label: 'Opening skill studio in timeline...',
    },
  };
}

function learnCardSubmitAction(
  skillName: string,
  mode: 'chat' | 'save' | 'discard',
): WebAction {
  const pendingLabel =
    mode === 'chat'
      ? 'Asking AI to update draft...'
      : mode === 'save'
        ? 'Saving skill...'
        : 'Discarding changes...';

  return {
    type: 'command',
    command: 'skills',
    subcommand: 'learn',
    arguments: { name: skillName },
    options: { mode },
    recordInTimeline: false,
    pendingUi: {
      presentation: 'widget',
      label: pendingLabel,
    },
  };
}

function deleteCustomSkillAction(skillName: string): WebAction {
  return {
    type: 'command',
    command: 'skills',
    subcommand: 'delete-custom',
    arguments: { name: skillName },
    options: {},
    refresh: REFRESH_SKILLS,
    recordInTimeline: false,
    pendingUi: { presentation: 'entity', label: 'Deleting skill...' },
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

function formatSessionChoiceLabel(sessionRow: {
  id: string;
  title: string | null;
}): string {
  const title = sessionRow.title?.trim();

  if (title) {
    return `${title} (${sessionRow.id.slice(0, 8)})`;
  }

  return `Untitled session (${sessionRow.id.slice(0, 8)})`;
}

function buildSkillSessionChoices({
  db,
  workspace,
  currentSessionId,
}: BuildSkillSessionChoicesProps): SkillSessionChoices {
  const rows = db
    .prepare(
      'SELECT id, title FROM sessions WHERE workspace = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 30',
    )
    .all(workspace) as Array<{ id: string; title: string | null }>;

  const currentRow = currentSessionId
    ? (rows.find((row) => row.id === currentSessionId) ??
      (db
        .prepare('SELECT id, title FROM sessions WHERE id = ?')
        .get(currentSessionId) as { id: string; title: string | null } | null))
    : null;

  const choices: string[] = ['current', 'none'];

  const choiceLabels: Record<string, string> = {
    current: currentRow
      ? `Current session: ${formatSessionChoiceLabel(currentRow)}`
      : 'Current session (if available)',
    none: 'No session context (instructions only)',
  };

  for (const sessionRow of rows) {
    choices.push(sessionRow.id);

    choiceLabels[sessionRow.id] =
      sessionRow.id === currentSessionId
        ? `${formatSessionChoiceLabel(sessionRow)} [current]`
        : formatSessionChoiceLabel(sessionRow);
  }

  return { choices, choiceLabels };
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

function renderLearnCustomSkillTreeItem(
  sessionChoices: SkillSessionChoices,
): WebNode {
  return {
    type: 'element',
    tag: 'treeItem',
    renderKey: 'skills-group:learn',
    props: {
      id: 'skills-group:learn',
      className: 'skills-manager-group',
      defaultExpanded: false,
      filterText: 'Learn Create Custom Skill AI Session',
      filterName: 'Learn / Create Custom Skill',
      filterPath: 'learn',
    },
    summary: {
      type: 'element',
      tag: 'text',
      props: {
        weight: 'bold',
        className: 'skills-manager-group-title',
      },
      children: [textNode('Learn / Create Custom Skill')],
    },
    children: [
      {
        type: 'element',
        tag: 'form',
        props: {
          className: 'web-form web-form--stacked skills-manager-inline-form',
          formOptionFieldNames: ['session'],
          action: openLearnSkillTimelineAction(null),
        },
        children: [
          textBlock(
            'Opens in the timeline with a conversation on top and an editable SKILL.md draft below.',
            'muted',
          ),
          {
            type: 'element',
            tag: 'textField',
            props: {
              formFieldName: 'name',
              inputPlaceholder: 'Skill name (e.g. relay-debug)',
              ariaLabel: 'Custom skill name',
            },
          },
          {
            type: 'element',
            tag: 'select',
            props: {
              formFieldName: 'session',
              choices: sessionChoices.choices,
              choiceLabels: sessionChoices.choiceLabels,
              value: 'current',
              ariaLabel: 'Reference session context',
            },
          },
          {
            type: 'element',
            tag: 'textArea',
            props: {
              formFieldName: 'instructions',
              maxRows: 4,
              inputPlaceholder:
                'Optional initial instructions for AI (or leave empty to open editor directly)...',
              ariaLabel: 'Initial skill instructions',
            },
          },
          row([
            {
              type: 'element',
              tag: 'button',
              props: {
                label: 'Open in Timeline',
                tone: 'warning',
                className: 'web-button',
                htmlType: 'submit',
              },
            },
          ]),
        ],
      },
    ],
  };
}

function renderSkillLearnCard({
  draft,
  savedSkill,
  sessionChoices,
}: RenderSkillLearnCardProps): WebNodeRoot {
  const statusLabel = draft.dirty
    ? 'Unsaved draft'
    : savedSkill
      ? 'Saved in DB'
      : 'New draft';

  const statusTone = draft.dirty
    ? ('warning' as const)
    : savedSkill
      ? ('success' as const)
      : ('muted' as const);

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'skills', subcommand: 'learn' },
    stylesheets: [
      {
        id: 'skills-learn-card',
        cssText: `
          .web-stack.skill-studio-card {
            padding: 0.25rem 0;
          }

          .web-text.skill-studio-title {
            color: var(--color-warning);
          }

          .web-box.skill-studio-chat-log {
            max-height: 22rem;
            overflow: auto;
            padding: 0.65rem;
            background: color-mix(in srgb, var(--color-bg, #000) 90%, var(--color-warning) 10%);
            border-left: 2px solid color-mix(in srgb, var(--color-warning) 65%, transparent);
          }

          .web-stack.skill-studio-turn {
            padding: 0.45rem 0;
            border-bottom: 1px solid color-mix(in srgb, var(--color-border, currentColor) 40%, transparent);
          }

          .web-stack.skill-studio-turn:last-child {
            padding-bottom: 0;
            border-bottom: 0;
          }

          .web-text.skill-studio-turn-role {
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--color-warning);
          }

          .web-textArea.skill-studio-markdown-editor textarea {
            min-height: 18rem;
            font-family: var(--font-mono, monospace);
            font-size: 0.84rem;
          }
        `.trim(),
      },
    ],
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'md', className: 'skill-studio-card' },
      children: [
        {
          type: 'element',
          tag: 'row',
          props: { gap: 'sm', align: 'between', itemAlign: 'center' },
          children: [
            row([
              {
                type: 'element',
                tag: 'text',
                props: { weight: 'bold', className: 'skill-studio-title' },
                children: [textNode(`Custom Skill: ${draft.skillName}`)],
              },
              {
                type: 'element',
                tag: 'badge',
                props: { label: statusLabel, tone: statusTone },
              },
            ]),
            {
              type: 'element',
              tag: 'button',
              props: {
                label: 'Open /skills',
                tone: 'muted',
                className: 'web-button',
                action: {
                  type: 'command',
                  command: 'skills',
                  subcommand: 'list',
                  arguments: {},
                  options: {},
                  recordInTimeline: false,
                  surface: 'modal',
                  modalTitle: 'AI Configuration',
                },
              },
            },
          ],
        },
        ...(draft.statusMessage
          ? [textBlock(draft.statusMessage, 'muted')]
          : []),
        {
          type: 'element',
          tag: 'form',
          renderKey: `skill-studio-form:${draft.skillName}:${draft.revision}`,
          props: {
            className: 'web-form web-form--stacked',
            formOptionFieldNames: ['session'],
            action: learnCardSubmitAction(draft.skillName, 'chat'),
          },
          children: [
            stack(
              [
                sectionTitle(
                  'AI Conversation',
                  `${draft.messages.length} message${draft.messages.length === 1 ? '' : 's'}`,
                ),
                {
                  type: 'element',
                  tag: 'box',
                  props: { className: 'skill-studio-chat-log' },
                  children:
                    draft.messages.length > 0
                      ? [
                          stack(
                            draft.messages.map((turn, idx) => ({
                              type: 'element' as const,
                              tag: 'stack' as const,
                              renderKey: `turn:${idx}`,
                              props: {
                                gap: 'xs' as const,
                                className: 'skill-studio-turn',
                              },
                              children: [
                                {
                                  type: 'element' as const,
                                  tag: 'text' as const,
                                  props: {
                                    weight: 'bold' as const,
                                    className: 'skill-studio-turn-role',
                                  },
                                  children: [
                                    textNode(
                                      turn.role === 'user' ? 'You' : 'AI',
                                    ),
                                  ],
                                },
                                textBlock(turn.content),
                              ],
                            })),
                            'xs',
                          ),
                        ]
                      : [
                          textBlock(
                            'No messages yet. Ask AI below to generate or revise the skill draft, or edit the markdown directly.',
                            'muted',
                          ),
                        ],
                },
                {
                  type: 'element',
                  tag: 'select',
                  props: {
                    formFieldName: 'session',
                    choices: sessionChoices.choices,
                    choiceLabels: sessionChoices.choiceLabels,
                    value: draft.sessionSelector,
                    ariaLabel: 'Reference session context',
                  },
                },
                {
                  type: 'element',
                  tag: 'textArea',
                  renderKey: `skill-studio-instructions:${draft.skillName}:${draft.revision}`,
                  props: {
                    formFieldName: 'instructions',
                    value: '',
                    maxRows: 5,
                    inputPlaceholder:
                      'Chat with AI to create or revise the draft (e.g. "Extract the workflow from this session" or "Make section 2 more concise")...',
                    ariaLabel: 'Message to AI skill author',
                  },
                },
                row([
                  {
                    type: 'element',
                    tag: 'button',
                    props: {
                      label: 'Send to AI',
                      tone: 'warning',
                      className: 'web-button',
                      htmlType: 'submit',
                      submitAction: learnCardSubmitAction(
                        draft.skillName,
                        'chat',
                      ),
                    },
                  },
                ]),
                {
                  type: 'element',
                  tag: 'divider',
                  props: {},
                },
                sectionTitle('Final Markdown Draft (SKILL.md)', 'Editable'),
                {
                  type: 'element',
                  tag: 'textArea',
                  renderKey: `skill-studio-markdown:${draft.skillName}:${draft.revision}`,
                  props: {
                    formFieldName: 'markdown',
                    value: draft.draftMarkdown,
                    maxRows: 24,
                    className:
                      'instructions-editor skill-studio-markdown-editor',
                    ariaLabel: `Markdown draft for ${draft.skillName}`,
                  },
                },
                row([
                  {
                    type: 'element',
                    tag: 'button',
                    props: {
                      label: 'Save',
                      tone: 'warning',
                      className: 'web-button',
                      htmlType: 'submit',
                      submitAction: learnCardSubmitAction(
                        draft.skillName,
                        'save',
                      ),
                    },
                  },
                  {
                    type: 'element',
                    tag: 'button',
                    props: {
                      label: 'Discard',
                      tone: 'muted',
                      className: 'web-button',
                      htmlType: 'submit',
                      submitAction: learnCardSubmitAction(
                        draft.skillName,
                        'discard',
                      ),
                    },
                  },
                ]),
              ],
              'sm',
            ),
          ],
        },
      ],
    },
  };
}

function skillTreeItem(skill: ManagedSkill): WebNode {
  const groupKey = skill.enabled ? 'enabled' : 'disabled';
  const actionLabel = skill.enabled ? 'Disable' : 'Enable';
  const treeItemId = `skill:${skill.name}`;
  const isCustom = skill.source === 'custom';

  const menuChildren: WebNode[] = [
    {
      type: 'element',
      tag: 'menuItem',
      props: {
        label: actionLabel,
        action: toggleAction(skill),
      },
    },
    ...(isCustom
      ? [
          {
            type: 'element' as const,
            tag: 'menuItem' as const,
            props: {
              label: 'Edit / Refine in Timeline',
              action: openLearnSkillTimelineAction(skill.name),
            },
          },
          {
            type: 'element' as const,
            tag: 'menuItem' as const,
            props: {
              label: 'Delete',
              tone: 'danger' as const,
              action: deleteCustomSkillAction(skill.name),
            },
          },
        ]
      : []),
  ];

  return {
    type: 'element',
    tag: 'treeItem',
    renderKey: treeItemId,
    props: {
      id: treeItemId,
      entityKey: treeItemId,
      className: 'skills-manager-item',
      defaultExpanded: false,
      filterText: [skill.name, skill.source, skill.description, skill.markdown]
        .filter(Boolean)
        .join('\n'),
      filterName: skill.name,
      filterPath: `${groupKey}/${skill.name}`,
    },
    summary: {
      type: 'element',
      tag: 'row',
      props: {
        gap: 'sm',
        align: 'between',
        itemAlign: 'center',
        className: 'skills-manager-item-summary',
      },
      children: [
        {
          type: 'element',
          tag: 'row',
          props: {
            gap: 'xs',
            itemAlign: 'center',
            fill: true,
            className: 'skills-manager-title-group',
          },
          children: [
            {
              type: 'element',
              tag: 'text',
              props: {
                weight: 'bold',
                className: 'skills-manager-name',
              },
              children: [textNode(skill.name)],
            },
            ...(isCustom
              ? [
                  {
                    type: 'element' as const,
                    tag: 'badge' as const,
                    props: { label: 'Custom', tone: 'muted' as const },
                  },
                ]
              : []),
          ],
        },
        {
          type: 'element',
          tag: 'overflowMenu',
          props: {
            label: '\u22EE',
            buttonVariant: 'icon',
            ariaLabel: `Actions for ${skill.name}`,
            title: `Actions for ${skill.name}`,
          },
          children: menuChildren,
        },
      ],
    },
    children: [
      ...(skill.description ? [textBlock(skill.description, 'muted')] : []),
      {
        type: 'element',
        tag: 'treeItem',
        renderKey: `skill-markdown:${skill.name}`,
        props: {
          id: `skill-markdown:${skill.name}`,
          className: 'skills-manager-markdown-item',
          defaultExpanded: false,
          filterText: [skill.name, 'Skill markdown', skill.markdown]
            .filter(Boolean)
            .join('\n'),
          filterName: 'Skill markdown',
          filterPath: `${groupKey}/${skill.name}/markdown`,
        },
        summary: {
          type: 'element',
          tag: 'text',
          props: {
            weight: 'semibold',
            tone: 'muted',
            className: 'skills-manager-markdown-title',
          },
          children: [textNode('Skill markdown')],
        },
        children: [
          {
            type: 'element',
            tag: 'box',
            props: {
              className: 'instructions-preview skills-manager-markdown-preview',
            },
            children: [textBlock(skill.markdown)],
          },
        ],
      },
    ],
  };
}

function skillsGroupTreeItem(
  label: 'Enabled' | 'Disabled',
  groupSkills: ManagedSkill[],
): WebNode {
  const groupKey = label.toLowerCase();

  return {
    type: 'element',
    tag: 'treeItem',
    renderKey: `skills-group:${groupKey}`,
    props: {
      id: `skills-group:${groupKey}`,
      className: 'skills-manager-group',
      defaultExpanded: groupSkills.length > 0,
      filterText: label,
      filterName: label,
      filterPath: groupKey,
    },
    summary: {
      type: 'element',
      tag: 'countLabel',
      props: {
        label,
        weight: 'bold',
        className: 'skills-manager-group-title',
      },
    },
    children:
      groupSkills.length > 0
        ? groupSkills.map((skill) => skillTreeItem(skill))
        : [textBlock(`No ${groupKey} skills.`, 'muted')],
  };
}

function renderSkillsManager(
  skills: ManagedSkill[],
  sessionChoices: SkillSessionChoices,
): WebNodeRoot {
  const enabledSkills = skills.filter((skill) => skill.enabled);
  const disabledSkills = skills.filter((skill) => !skill.enabled);

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'skills', subcommand: 'list' },
    stylesheets: [
      {
        id: 'skills-manager',
        cssText: `
          .web-treeItem.skills-manager-group {
            padding: 0.35rem 0;
            border-bottom: 1px solid color-mix(in srgb, var(--color-border, currentColor) 55%, transparent);
          }

          .web-treeItem.skills-manager-group:last-child {
            padding-bottom: 0;
            border-bottom: 0;
          }

          .web-countLabel.skills-manager-group-title,
          .web-text.skills-manager-group-title {
            color: var(--color-warning);
          }

          .web-treeItem.skills-manager-item > .web-tree-item-summary {
            align-items: center;
          }

          .web-treeItem.skills-manager-item > .web-tree-item-summary > .web-tree-toggle {
            margin-top: 0;
          }

          .web-row.skills-manager-item-summary {
            flex: 1;
            min-width: 0;
            flex-wrap: nowrap;
          }

          .web-row.skills-manager-title-group {
            min-width: 0;
          }

          .web-text.skills-manager-name {
            color: var(--color-warning);
          }

          .web-text.skills-manager-markdown-title {
            font-size: 0.85rem;
          }

          .web-form.skills-manager-inline-form {
            padding: 0.45rem 0.55rem;
            background: color-mix(in srgb, var(--color-surface-alt, #111) 92%, var(--color-warning) 8%);
            border-left: 2px solid color-mix(in srgb, var(--color-warning) 70%, transparent);
          }

          .web-box.skills-manager-markdown-preview {
            max-height: 14rem;
            overflow: auto;
            padding: 0.55rem;
            background: color-mix(in srgb, var(--color-bg, #000) 88%, var(--color-warning) 12%);
          }

          .web-box.skills-manager-markdown-preview .web-text {
            font-family: var(--font-mono, monospace);
            font-size: 0.82rem;
          }
        `.trim(),
      },
    ],
    tree: {
      type: 'element',
      tag: 'tree',
      props: {
        className: 'skills-manager-tree',
        filterable: true,
        filterPlaceholder: 'Filter skills',
        gap: 'xs',
      },
      children: [
        renderLearnCustomSkillTreeItem(sessionChoices),
        skillsGroupTreeItem('Enabled', enabledSkills),
        skillsGroupTreeItem('Disabled', disabledSkills),
      ],
    },
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

function readAgentsMarkdown(
  cwd: string,
  workspace: 'parent' | 'appweaver',
): string | null {
  const path =
    workspace === 'appweaver'
      ? join(cwd, '.appweaver', 'AGENTS.md')
      : join(cwd, 'AGENTS.md');

  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

type RenderConfigurationManagerProps = {
  seenDb: CoreDb;
  skills: ManagedSkill[];
  sessionChoices: SkillSessionChoices;
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
  sessionChoices,
  runtimeContext,
  workspace,
  workspaceInstructions,
  customized,
  agentsMarkdown,
  defaultActiveTab,
}: RenderConfigurationManagerProps): WebHandlerResult {
  const skillsManager = renderSkillsManager(skills, sessionChoices);
  const invocationRules = listToolInvocationRules(seenDb);

  const metaSubcommand =
    defaultActiveTab === 'skills'
      ? 'list'
      : defaultActiveTab === 'tool-invocations'
        ? 'tool-invocations'
        : 'manager';

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'skills', subcommand: metaSubcommand },
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

function payloadRecord(
  payload: unknown,
  field: 'arguments' | 'options',
): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[field];

  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function instructionsFromPayload(payload: unknown): string | null {
  const args = payloadRecord(payload, 'arguments');
  const instructions = args?.instructions;

  return typeof instructions === 'string' ? instructions : null;
}

function parseLearnCliTokens(tokens: string[]): {
  name: string;
  sessionSelector: string;
  instructions: string;
} {
  let sessionSelector = 'current';
  const positional: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if ((token === '--session' || token === '-s') && tokens[i + 1]) {
      sessionSelector = tokens[i + 1];
      i += 1;
      continue;
    }

    positional.push(token);
  }

  return {
    name: positional[0] ?? '',
    sessionSelector,
    instructions: positional.slice(1).join(' ').trim(),
  };
}

function resolveSkillReferenceTranscript({
  db,
  workspace,
  sessionSelector,
  currentSessionId,
}: ResolveSkillReferenceTranscriptProps): SkillReferenceTranscript | null {
  const trimmedSelector = sessionSelector.trim();

  if (!trimmedSelector || trimmedSelector.toLowerCase() === 'none') {
    return null;
  }

  let resolvedSession: { id: string; title: string | null } | null = null;

  if (trimmedSelector.toLowerCase() === 'current') {
    if (!currentSessionId) {
      return null;
    }

    resolvedSession = db
      .prepare('SELECT id, title FROM sessions WHERE id = ?')
      .get(currentSessionId) as { id: string; title: string | null } | null;
  } else {
    resolvedSession =
      (db
        .prepare('SELECT id, title FROM sessions WHERE id = ?')
        .get(trimmedSelector) as { id: string; title: string | null } | null) ??
      (db
        .prepare(
          'SELECT id, title FROM sessions WHERE workspace = ? AND LOWER(title) = LOWER(?) ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1',
        )
        .get(workspace, trimmedSelector) as {
        id: string;
        title: string | null;
      } | null);
  }

  if (!resolvedSession) {
    return null;
  }

  const rows = db
    .prepare(
      'SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY id DESC LIMIT 40',
    )
    .all(resolvedSession.id) as Array<{ role: string; content: string }>;

  if (rows.length === 0) {
    return null;
  }

  const formattedMessages = rows
    .reverse()
    .map((row) => {
      const clipped =
        row.content.length > 1500
          ? `${row.content.slice(0, 1500)}…`
          : row.content;

      return `[${row.role.toUpperCase()}]\n${clipped}`;
    })
    .join('\n\n');

  const transcript =
    formattedMessages.length > 24000
      ? formattedMessages.slice(-24000)
      : formattedMessages;

  return {
    sessionId: resolvedSession.id,
    sessionLabel: formatSessionChoiceLabel(resolvedSession),
    transcript,
  };
}

function buildSkillLearnPrompt({
  skillName,
  instructions,
  currentDraftMarkdown,
  conversation,
  reference,
}: BuildSkillLearnPromptProps): string {
  const sections: string[] = [
    `Target skill name: ${skillName}`,
    '',
    'You are collaborating with the user to write or refine an OpenCode SKILL.md document.',
    'Format your response in two parts:',
    '1. A concise conversational reply to the user (summarize what you drafted/changed, or answer their question).',
    `2. The complete updated SKILL.md wrapped inside <skill_markdown>...</skill_markdown> tags. Inside <skill_markdown>, start with YAML frontmatter delimited by --- containing \`name: ${skillName}\` and a 1-2 sentence \`description\`, followed by the skill Markdown body.`,
  ];

  if (currentDraftMarkdown.trim()) {
    sections.push('', 'Current SKILL.md draft:', currentDraftMarkdown);
  }

  if (reference) {
    sections.push(
      '',
      `Reference session transcript (${reference.sessionLabel}):`,
      reference.transcript,
    );
  }

  if (conversation.length > 0) {
    sections.push(
      '',
      'Conversation history so far:',
      conversation
        .map((turn) => `[${turn.role.toUpperCase()}]: ${turn.content}`)
        .join('\n\n'),
    );
  }

  sections.push(
    '',
    'Latest user message:',
    instructions ||
      'Extract the reusable workflow, conventions, and lessons from the reference session into this skill.',
  );

  return sections.join('\n');
}

function parseSkillAiResponse(
  rawOutput: string,
  previousMarkdown: string,
): { reply: string; markdown: string } {
  const trimmed = rawOutput.trim();

  const tagMatch = trimmed.match(
    /<skill_markdown>([\s\S]*?)<\/skill_markdown>/i,
  );

  if (tagMatch) {
    const inner = tagMatch[1]
      .trim()
      .replace(/^```(?:markdown|md|yaml)?\s*\n?/i, '')
      .replace(/\n?```\s*$/, '')
      .trim();

    const outside = trimmed
      .replace(/<skill_markdown>[\s\S]*?<\/skill_markdown>/i, '')
      .trim();

    return {
      reply:
        outside ||
        'Updated the SKILL.md draft below. Review it and click Save when ready.',
      markdown: inner || previousMarkdown,
    };
  }

  if (trimmed.startsWith('---')) {
    return {
      reply:
        'Updated the SKILL.md draft below. Let me know if you want any adjustments, or click Save.',
      markdown: trimmed,
    };
  }

  return {
    reply: trimmed,
    markdown: previousMarkdown,
  };
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

      const currentSessionId =
        ctx.sessionId ??
        getState(
          ctx.seenDb,
          ctx.source === 'web'
            ? webSessionStateKey(workspace)
            : STATE_CURRENT_SESSION,
        );

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
        sessionChoices: buildSkillSessionChoices({
          db: ctx.seenDb,
          workspace,
          currentSessionId,
        }),
        runtimeContext: buildActiveRuntimeContext({
          backendName: 'opencode',
          dmBotRoot: ctx.dmBotRoot,
          cwd: ctx.cwd,
          sessionId: null,
          sessionTitle: null,
        }),
        workspace,
        workspaceInstructions: configuredInstructions.instructions,
        customized: configuredInstructions.customized,
        agentsMarkdown: readAgentsMarkdown(ctx.cwd, workspace),
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

  if (sub === 'learn') {
    return handleError(async (): Promise<WebHandlerResult> => {
      const workspace = getWorkspaceTarget(ctx.seenDb);

      const currentSessionId =
        ctx.sessionId ??
        getState(
          ctx.seenDb,
          ctx.source === 'web'
            ? webSessionStateKey(workspace)
            : STATE_CURRENT_SESSION,
        );

      const payloadArgs = payloadRecord(ctx.jsonPayload, 'arguments');
      const payloadOptions = payloadRecord(ctx.jsonPayload, 'options');
      const cliParsed = parseLearnCliTokens(ctx.args.slice(1));

      const rawName =
        typeof payloadArgs?.name === 'string' && payloadArgs.name.trim()
          ? payloadArgs.name.trim()
          : cliParsed.name;

      if (!rawName) {
        return `Usage: ${ctx.prefix}skills learn <name> [--session <id|current|none>] [instructions]`;
      }

      const skillName = normalizeCustomSkillName(rawName);

      const mode =
        typeof payloadOptions?.mode === 'string' ? payloadOptions.mode : 'chat';

      const sessionSelector =
        typeof payloadOptions?.session === 'string' &&
        payloadOptions.session.trim()
          ? payloadOptions.session.trim()
          : cliParsed.sessionSelector;

      const rawInstructions = payloadArgs?.instructions;

      const instructions =
        typeof rawInstructions === 'string'
          ? rawInstructions.trim()
          : Array.isArray(rawInstructions)
            ? rawInstructions.map(String).join(' ').trim()
            : cliParsed.instructions;

      const submittedMarkdown =
        typeof payloadArgs?.markdown === 'string' ? payloadArgs.markdown : null;

      let existing = getCustomSkill(ctx.seenDb, skillName);

      const draft = getOrCreateSkillDraftSession({
        workspace,
        skillName,
        existingMarkdown: existing?.markdown ?? null,
        sessionSelector,
      });

      const sessionChoices = buildSkillSessionChoices({
        db: ctx.seenDb,
        workspace,
        currentSessionId,
      });

      if (mode === 'save') {
        const markdownToSave = (
          submittedMarkdown ?? draft.draftMarkdown
        ).trim();

        if (!markdownToSave) {
          throw new Error('Markdown draft cannot be empty.');
        }

        const saved = upsertCustomSkill({
          db: ctx.seenDb,
          dmBotRoot: ctx.dmBotRoot,
          workspaceRoot: ctx.cwd,
          skillName,
          markdown: markdownToSave,
          enableInWorkspace: existing ? null : true,
        });

        existing = getCustomSkill(ctx.seenDb, skillName);
        draft.draftMarkdown = saved.markdown;
        draft.dirty = false;
        draft.revision += 1;

        const savedManaged = listManagedSkills({
          db: ctx.seenDb,
          dmBotRoot: ctx.dmBotRoot,
          workspaceRoot: ctx.cwd,
        }).find((skill) => skill.name === saved.name);

        draft.statusMessage = `Saved ${saved.name} (${savedManaged?.enabled ? 'enabled' : 'disabled'}).`;

        return renderSkillLearnCard({
          draft,
          savedSkill: existing,
          sessionChoices,
        });
      }

      if (mode === 'discard') {
        draft.draftMarkdown =
          existing?.markdown ?? defaultSkillMarkdownTemplate(skillName);

        draft.messages = [];
        draft.dirty = false;
        draft.revision += 1;

        draft.statusMessage = existing
          ? `Discarded unsaved changes and restored ${skillName} from database.`
          : 'Discarded unsaved draft.';

        return renderSkillLearnCard({
          draft,
          savedSkill: existing,
          sessionChoices,
        });
      }

      if (submittedMarkdown !== null && submittedMarkdown.trim()) {
        draft.draftMarkdown = submittedMarkdown;
      }

      if (!instructions) {
        if (ctx.source === 'web') {
          draft.statusMessage = null;

          return renderSkillLearnCard({
            draft,
            savedSkill: existing,
            sessionChoices,
          });
        }

        return `Usage: ${ctx.prefix}skills learn <name> [--session <id|current|none>] <instructions>`;
      }

      const reference = resolveSkillReferenceTranscript({
        db: ctx.seenDb,
        workspace,
        sessionSelector: draft.sessionSelector,
        currentSessionId,
      });

      const promptText = buildSkillLearnPrompt({
        skillName,
        instructions,
        currentDraftMarkdown: draft.draftMarkdown,
        conversation: draft.messages,
        reference,
      });

      const agent = createPluginAgentService({
        db: ctx.seenDb,
        dmBotRoot: ctx.dmBotRoot,
        parentOfBotRoot: ctx.parentOfBotRoot,
        attachUrl: ctx.attachUrl,
      });

      const completion = await agent.completeText({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert AI skill author for OpenCode. Help the user iteratively design and refine a concise, high-signal SKILL.md file with valid YAML frontmatter.',
            reasoning: null,
          },
          {
            role: 'user',
            content: promptText,
            reasoning: null,
          },
        ],
        workspaceTarget: workspace,
        modelSourceId: null,
        modelId: null,
        abortSignal: null,
      });

      const rawOutput = getMessageOutput(completion.outputs).trim();

      if (!rawOutput) {
        throw new Error('Model returned empty response.');
      }

      const parsed = parseSkillAiResponse(rawOutput, draft.draftMarkdown);

      draft.messages.push(
        { role: 'user', content: instructions },
        { role: 'assistant', content: parsed.reply },
      );

      draft.draftMarkdown = parsed.markdown;
      draft.dirty = true;
      draft.revision += 1;

      draft.statusMessage =
        'Draft updated by AI (not saved yet). Review or edit below, then click Save.';

      if (ctx.source === 'web') {
        return renderSkillLearnCard({
          draft,
          savedSkill: existing,
          sessionChoices,
        });
      }

      const saved = upsertCustomSkill({
        db: ctx.seenDb,
        dmBotRoot: ctx.dmBotRoot,
        workspaceRoot: ctx.cwd,
        skillName,
        markdown: draft.draftMarkdown,
        enableInWorkspace: existing ? null : true,
      });

      draft.dirty = false;

      return `${existing ? 'Refined' : 'Created'} custom skill ${saved.name}${reference ? ` using context from ${reference.sessionLabel}` : ''}.\n\n${parsed.reply}`;
    }, 'Failed to learn custom skill');
  }

  if (sub === 'save-custom') {
    return handleError(async () => {
      const payloadArgs = payloadRecord(ctx.jsonPayload, 'arguments');

      const rawName =
        typeof payloadArgs?.name === 'string' && payloadArgs.name.trim()
          ? payloadArgs.name.trim()
          : (ctx.args[1] ?? '');

      const markdown =
        typeof payloadArgs?.markdown === 'string'
          ? payloadArgs.markdown
          : ctx.args.slice(2).join(' ');

      if (!rawName || !markdown.trim()) {
        return `Usage: ${ctx.prefix}skills save-custom <name> <markdown>`;
      }

      const saved = upsertCustomSkill({
        db: ctx.seenDb,
        dmBotRoot: ctx.dmBotRoot,
        workspaceRoot: ctx.cwd,
        skillName: rawName,
        markdown,
        enableInWorkspace: null,
      });

      return `Saved custom skill ${saved.name}.`;
    }, 'Failed to save custom skill');
  }

  if (sub === 'delete-custom') {
    return handleError(async () => {
      const payloadArgs = payloadRecord(ctx.jsonPayload, 'arguments');

      const rawName =
        typeof payloadArgs?.name === 'string' && payloadArgs.name.trim()
          ? payloadArgs.name.trim()
          : (ctx.args[1] ?? '');

      if (!rawName) {
        return `Usage: ${ctx.prefix}skills delete-custom <name>`;
      }

      const normalizedName = normalizeCustomSkillName(rawName);

      const deleted = deleteCustomSkill({
        db: ctx.seenDb,
        dmBotRoot: ctx.dmBotRoot,
        workspaceRoots: [ctx.dmBotRoot, ctx.parentOfBotRoot],
        skillName: normalizedName,
      });

      if (!deleted) {
        return `Custom skill ${normalizedName} not found.`;
      }

      return `Deleted custom skill ${normalizedName}.`;
    }, 'Failed to delete custom skill');
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
