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
    tag: 'row',
    props: {
      itemAlign: 'center',
      className: 'skills-manager-row',
      entityKey: `skill:${skill.name}`,
    },
    children: [
      {
        type: 'element',
        tag: 'stack',
        props: { gap: 'xs', className: 'skills-manager-copy' },
        children: [
          {
            type: 'element',
            tag: 'text',
            props: { weight: 'bold', className: 'skills-manager-name' },
            children: [textNode(skill.name)],
          },
          ...(skill.description ? [textBlock(skill.description, 'muted')] : []),
        ],
      },
      {
        type: 'element',
        tag: 'button',
        props: {
          label: skill.enabled ? 'Disable' : 'Enable',
          ariaLabel: `${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`,
          className: `web-button skills-manager-toggle ${skill.enabled ? 'skills-manager-toggle--enabled' : 'skills-manager-toggle--disabled'}`,
          action: toggleAction(skill),
        },
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
          .web-row.skills-manager-row {
            align-items: center;
            gap: 0.8rem;
            padding: 0.55rem 0;
            border-bottom: 1px solid color-mix(in srgb, var(--color-border, currentColor) 55%, transparent);
          }

          .web-row.skills-manager-row:first-child {
            padding-top: 0;
          }

          .web-row.skills-manager-row:last-child {
            padding-bottom: 0;
            border-bottom: 0;
          }

          .web-stack.skills-manager-copy {
            flex: 1 1 auto;
            min-width: 0;
          }

          .web-text.skills-manager-name {
            color: var(--color-warning);
          }

          .web-button.skills-manager-toggle {
            min-width: 5.8rem;
            flex: 0 0 auto;
            padding: 0.2rem 0.65rem;
            border: 2px solid #000;
            box-shadow: 4px 4px 0 var(--color-panel-shadow);
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .web-button.skills-manager-toggle--enabled {
            background: var(--color-silver);
          }

          .web-button.skills-manager-toggle--disabled {
            background: var(--color-warning);
          }

          @media (max-width: 520px) {
            .web-row.skills-manager-row {
              align-items: flex-start;
            }

            .web-button.skills-manager-toggle {
              min-width: 5.2rem;
            }
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
