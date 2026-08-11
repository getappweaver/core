import {
  listManagedSkills,
  setManagedSkillEnabled,
  type ManagedSkill,
} from '@src/skills/manager';
import type { WebAction, WebHandlerResult, WebNode } from '@src/web/ui-schema';
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
    refresh: REFRESH,
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

function renderSkillsManager(skills: ManagedSkill[]): WebHandlerResult {
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
    return handleError(
      async () =>
        renderSkillsManager(
          listManagedSkills({
            db: ctx.seenDb,
            dmBotRoot: ctx.dmBotRoot,
            workspaceRoot: ctx.cwd,
          }),
        ),
      'Failed to open skills manager',
    );
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
