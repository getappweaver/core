import {
  getSimplePermissionActions,
  readOpencodeAgentsDraft,
  type OpencodeAgentDraftConfig,
} from '@src/backends/opencode-config';
import {
  getAgentBackend,
  getSelectedOpencodeAgent,
  type CoreDb,
} from '@src/db';
import type { WebAction, WebHandlerResult, WebNode } from '@src/web/ui-schema';
import { row, stack, textBlock } from '@src/web/widgets';

import { toPermissionFormOptions } from '../agents-permission-options';

type HandleAiAgentsProps = {
  seenDb: CoreDb;
  dmBotRoot: string;
};

const REFRESH = {
  command: 'ai',
  subcommand: 'agents',
  arguments: {},
  options: {},
} as const;

function commandAction(params: {
  subcommand: string;
  arguments?: Record<string, unknown>;
  options?: Record<string, unknown>;
  presentation?: 'run' | 'form';
  surface?: 'timeline' | 'modal';
  modalTitle?: string;
  refresh?: boolean;
}): WebAction {
  return {
    type: 'command',
    command: 'ai',
    subcommand: params.subcommand,
    arguments: params.arguments ?? {},
    options: params.options ?? {},
    ...(params.refresh === false ? {} : { refresh: REFRESH }),
    ...(params.presentation ? { presentation: params.presentation } : {}),
    ...(params.surface ? { surface: params.surface } : {}),
    ...(params.modalTitle ? { modalTitle: params.modalTitle } : {}),
  };
}

function button(
  label: string,
  action: WebAction,
  params?: {
    tone?: 'info' | 'danger';
    disabled?: boolean;
    stopPropagation?: boolean;
  },
): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: {
      label,
      action,
      ...(params?.tone ? { tone: params.tone } : {}),
      ...(params?.disabled ? { disabled: true } : {}),
      ...(params?.stopPropagation ? { stopPropagation: true } : {}),
    },
  };
}

function badge(label: string, tone: 'info' | 'success' | 'warning'): WebNode {
  return {
    type: 'element',
    tag: 'badge',
    props: { tone },
    children: [{ type: 'text', value: label }],
  };
}

function buildAgentRow(params: {
  agent: OpencodeAgentDraftConfig;
  currentAgent: string;
}): WebNode {
  const { agent, currentAgent } = params;
  const isCurrent = agent.name === currentAgent;

  return {
    type: 'element',
    tag: 'box',
    props: {
      padding: 'sm',
      className: `agent-card ${isCurrent ? 'agent-card--current' : ''}`.trim(),
      action: commandAction({
        subcommand: 'agent-set',
        arguments: { name: agent.name },
      }),
    },
    children: [
      stack(
        [
          row(
            [
              {
                type: 'element',
                tag: 'text',
                props: {
                  weight: 'bold',
                  className:
                    `agent-card__name ${agent.color ? `agent-card__name--${agent.color}` : ''}`.trim(),
                },
                children: [{ type: 'text', value: agent.name }],
              },
              ...(isCurrent ? [badge('current', 'info')] : []),
              ...(agent.disabled ? [badge('disabled', 'warning')] : []),
            ],
            'sm',
          ),
          ...(agent.description ? [textBlock(agent.description, 'muted')] : []),
          {
            type: 'element',
            tag: 'text',
            props: {
              className: agent.model
                ? 'agent-card__model'
                : 'agent-card__model agent-card__model--muted',
            },
            children: [
              { type: 'text', value: 'Model: ' },
              { type: 'text', value: agent.model ?? '(none)' },
            ],
          },
          row(
            [
              button(
                'Edit',
                commandAction({
                  subcommand: 'agents-edit',
                  arguments: { name: agent.name },
                  options: {
                    description: agent.description ?? '',
                    model: agent.model ?? '',
                    color: agent.color ?? '',
                    steps: agent.steps ?? '',
                    mode: agent.mode ?? 'primary',
                    system_prompt: agent.systemPrompt ?? '',
                    hidden: agent.hidden,
                    disabled: agent.disabled,
                    ...toPermissionFormOptions(
                      getSimplePermissionActions(agent.permission),
                    ),
                  },
                  surface: 'timeline',
                  refresh: false,
                }),
                { stopPropagation: true },
              ),
              button(
                'Delete',
                commandAction({
                  subcommand: 'agents-delete',
                  arguments: { name: agent.name },
                }),
                { tone: 'danger', stopPropagation: true },
              ),
            ],
            'sm',
          ),
        ],
        'sm',
      ),
    ],
  };
}

export async function handleAiAgents(
  props: HandleAiAgentsProps,
): Promise<WebHandlerResult> {
  const { seenDb, dmBotRoot } = props;
  const backendName = getAgentBackend(seenDb);

  if (backendName === 'cursor') {
    return 'OpenCode agent management is available only when the backend is opencode.';
  }

  const config = await readOpencodeAgentsDraft(dmBotRoot);
  const currentAgent = getSelectedOpencodeAgent(seenDb);

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'ai', subcommand: 'agents' },
    shadowMountOverflow: 'scroll-y',
    stylesheets: [
      {
        id: 'ai-agents-list',
        cssText: `
          .agent-card {
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(255, 255, 255, 0.03);
            cursor: pointer;
            transition: background 0.12s ease, border-color 0.12s ease;
          }

          .agent-card:hover,
          .agent-card:focus-visible {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.22);
          }

          .agent-card--current {
            background: rgba(255, 215, 0, 0.12);
            border-color: rgba(255, 215, 0, 0.45);
          }

          .agent-card__name--info { color: var(--color-accent, #67b7ff); }
          .agent-card__name--warning { color: var(--color-warning, #ffd166); }
          .agent-card__name--danger { color: var(--color-danger, #ff6b6b); }
          .agent-card__name--success { color: #98ff98; }

          .agent-card__model {
            font-weight: 700;
            color: #f3f3f3;
          }

          .agent-card__model--muted {
            font-weight: 400;
            color: var(--color-silver);
          }
        `.trim(),
      },
    ],
    tree: stack([
      row(
        [
          button(
            'New Agent',
            commandAction({
              subcommand: 'agents-new',
              arguments: { name: '' },
              options: {
                description: '',
                model: '',
                color: '',
                steps: '',
                mode: 'primary',
                system_prompt: '',
                hidden: false,
                disabled: false,
                ...toPermissionFormOptions({}),
              },
              surface: 'timeline',
              refresh: false,
            }),
          ),
          button(
            'Restore Defaults',
            commandAction({ subcommand: 'agent-restore' }),
            { tone: 'danger' },
          ),
        ],
        'sm',
      ),
      textBlock(`Selected agent: ${currentAgent}`),
      ...(config.agents.length > 0
        ? config.agents.map((agent) =>
            buildAgentRow({
              agent,
              currentAgent,
            }),
          )
        : [textBlock('No agents defined in .opencode/agents/.', 'muted')]),
    ]),
  };
}
