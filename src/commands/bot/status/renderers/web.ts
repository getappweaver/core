import type { WebRenderContext } from '@src/system/render-context';
import { formatMsats, msats } from '@src/types';
import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { row, stack } from '@src/web/widgets';

import type { BotStatusData, BotStatusRepresentation } from '../representation';

type KvRowProps = {
  label: string;
  labelClassName?: string;
  value: string;
  valueTone: WebTone | null;
  valueClassName?: string;
  nowrapValue?: boolean;
  menuItems?: Array<{
    label: string;
    action: WebAction;
  }>;
};

const STATUS_REFRESH = {
  command: 'bot',
  subcommand: 'status',
  arguments: {},
  options: {},
} as const;

function commandAction(params: {
  command: string;
  subcommand: string;
  arguments?: Record<string, unknown>;
  options?: Record<string, unknown>;
  presentation?: 'run' | 'form';
  surface?: 'timeline' | 'modal';
  modalTitle?: string;
  argumentChoices?: Record<string, Array<{ value: string; label: string }>>;
}): WebAction {
  return {
    type: 'command',
    command: params.command,
    subcommand: params.subcommand,
    arguments: params.arguments ?? {},
    options: params.options ?? {},
    refresh: STATUS_REFRESH,
    ...(params.presentation ? { presentation: params.presentation } : {}),
    ...(params.surface ? { surface: params.surface } : {}),
    ...(params.modalTitle ? { modalTitle: params.modalTitle } : {}),
    ...(params.argumentChoices
      ? { argumentChoices: params.argumentChoices }
      : {}),
  };
}

function opencodeModelFormChoices(
  d: BotStatusData,
): Array<{ value: string; label: string }> | null {
  if (d.backend !== 'opencode') {
    return null;
  }

  return [
    { value: 'reset', label: 'Clear / reset' },
    ...d.opencodeModelCatalog,
  ];
}

function overflowMenu(
  label: string,
  items: NonNullable<KvRowProps['menuItems']>,
): WebNode {
  return {
    type: 'element',
    tag: 'overflowMenu',
    props: {
      label,
      className: 'web-button web-button--link status-value-trigger',
    },
    children: items.map((item) => ({
      type: 'element',
      tag: 'menuItem',
      props: {
        label: item.label,
        action: item.action,
      },
    })),
  };
}

function kvRow({
  label,
  labelClassName,
  value,
  valueTone,
  valueClassName,
  nowrapValue,
  menuItems,
}: KvRowProps): WebNode {
  return {
    type: 'element',
    tag: 'row',
    props: {
      className: nowrapValue
        ? 'status-kv-row status-kv-row--nowrap'
        : 'status-kv-row',
      align: 'between',
      gap: 'md',
      itemAlign: 'center',
    },
    children: [
      {
        type: 'element',
        tag: 'text',
        props: {
          tone: 'muted',
          ...(labelClassName ? { className: labelClassName } : {}),
        },
        children: [{ type: 'text', value: label }],
      },
      row(
        menuItems?.length
          ? [overflowMenu(value, menuItems)]
          : [
              {
                type: 'element',
                tag: 'text',
                props: {
                  ...(valueTone ? { tone: valueTone } : {}),
                  ...(valueClassName ? { className: valueClassName } : {}),
                },
                children: [{ type: 'text', value }],
              },
            ],
        'sm',
      ),
    ],
  };
}

export function renderBotStatusWeb(
  representation: BotStatusRepresentation,
  _context: WebRenderContext,
): WebNodeRoot {
  const d = representation.data;
  const modelFormChoices = opencodeModelFormChoices(d);

  const providerValue =
    d.provider === 'routstr'
      ? `routstr (budget: ${formatMsats(msats(d.routstrBudgetMsatsRaw ?? 0))})`
      : 'local';

  const executionProfileLabel =
    d.executionProfileKind === 'agent' ? 'Agent' : 'Mode';

  const backendItems = [
    {
      label: 'cursor',
      action: commandAction({
        command: 'ai',
        subcommand: 'backend',
        arguments: { name: 'cursor' },
      }),
    },
    {
      label: 'opencode',
      action: commandAction({
        command: 'ai',
        subcommand: 'backend',
        arguments: { name: 'opencode' },
      }),
    },
  ];

  const providerItems = [
    {
      label: 'local',
      action: commandAction({
        command: 'ai',
        subcommand: 'provider',
        arguments: { subcommand: 'set local' },
      }),
    },
    {
      label: 'routstr',
      action: commandAction({
        command: 'ai',
        subcommand: 'provider',
        arguments: { subcommand: 'set routstr' },
      }),
    },
  ];

  const sessionMenuItems = [
    {
      label: 'new',
      action: commandAction({
        command: 'session',
        subcommand: 'new',
      }),
    },
  ];

  const executionProfileItems =
    d.executionProfileKind === 'agent'
      ? [
          ...d.opencodeAgentNames.map((agentName) => ({
            label: agentName,
            action: commandAction({
              command: 'ai',
              subcommand: 'agent-set',
              arguments: { name: agentName },
            }),
          })),
          {
            label: 'Manage agents',
            action: commandAction({
              command: 'ai',
              subcommand: 'agents',
              surface: 'modal',
              modalTitle: 'OpenCode Agents',
            }),
          },
        ]
      : [
          {
            label: 'ask',
            action: commandAction({
              command: 'ai',
              subcommand: 'mode',
              arguments: { mode: 'ask' },
            }),
          },
          {
            label: 'plan',
            action: commandAction({
              command: 'ai',
              subcommand: 'mode',
              arguments: { mode: 'plan' },
            }),
          },
          {
            label: 'yolo',
            action: commandAction({
              command: 'ai',
              subcommand: 'mode',
              arguments: { mode: 'agent' },
            }),
          },
        ];

  const modelMenuItems = [
    {
      label: d.modelOverride ? 'Change override' : 'Set override',
      action: commandAction({
        command: 'ai',
        subcommand: 'model',
        arguments: {
          name_or_reset: d.modelOverride ?? '',
        },
        presentation: 'form',
        ...(modelFormChoices
          ? { argumentChoices: { name_or_reset: modelFormChoices } }
          : {}),
      }),
    },
    {
      label: 'Clear override',
      action: commandAction({
        command: 'ai',
        subcommand: 'model',
        arguments: { name_or_reset: 'reset' },
      }),
    },
  ];

  const rootModelMenuItems = [
    {
      label: d.opencodeRootModel ? 'Change root model' : 'Set root model',
      action: commandAction({
        command: 'ai',
        subcommand: 'root-model',
        arguments: { model_or_reset: d.opencodeRootModel ?? '' },
        presentation: 'form',
        surface: 'modal',
        modalTitle: 'Set Root Model',
        ...(modelFormChoices
          ? { argumentChoices: { model_or_reset: modelFormChoices } }
          : {}),
      }),
    },
  ];

  const rows: WebNode[] = [
    kvRow({
      label: 'Backend',
      value: d.backend,
      valueTone: 'info',
      nowrapValue: true,
      menuItems: backendItems,
    }),
    kvRow({
      label: 'Provider',
      value: providerValue,
      valueTone: d.provider === 'routstr' ? 'info' : 'muted',
      nowrapValue: true,
      menuItems: providerItems,
    }),
    kvRow({
      label: 'Session',
      value: d.sessionId ?? '(none)',
      valueTone: d.sessionId ? 'info' : 'muted',
      nowrapValue: true,
      menuItems: sessionMenuItems,
    }),
    kvRow({
      label: executionProfileLabel,
      value: d.executionProfileDisplayName,
      valueTone: null,
      nowrapValue: true,
      menuItems: executionProfileItems,
    }),
    kvRow({
      label: 'Linting',
      value: d.linting,
      valueTone: d.linting === 'on' ? 'success' : 'muted',
      nowrapValue: true,
    }),
  ];

  if (d.executionProfileKind === 'agent') {
    rows.push(
      kvRow({
        label: 'Root model',
        value: d.opencodeRootModel ?? '(none)',
        valueTone: d.opencodeRootModel ? null : 'muted',
        nowrapValue: true,
        menuItems: rootModelMenuItems,
      }),
      kvRow({
        label: 'Agent model',
        value: d.opencodeAgentModel ?? '(none)',
        valueTone: d.opencodeAgentModel ? null : 'muted',
        nowrapValue: true,
      }),
      kvRow({
        label: 'Override model',
        value: d.modelOverride ?? '(off)',
        valueTone: d.modelOverride ? 'info' : 'muted',
        nowrapValue: true,
        menuItems: modelMenuItems,
      }),
      kvRow({
        label: 'Effective model',
        labelClassName: 'status-effective-model',
        value: d.resolvedModelName,
        valueTone: null,
        valueClassName: 'status-effective-model',
        nowrapValue: true,
      }),
      kvRow({
        label: 'Source',
        labelClassName: 'status-effective-model',
        value: d.effectiveModelSource,
        valueTone: d.effectiveModelSource === 'override' ? 'info' : 'muted',
        valueClassName: 'status-effective-model',
        nowrapValue: true,
      }),
    );
  } else {
    rows.push(
      kvRow({
        label: 'Model',
        labelClassName: 'status-effective-model',
        value: d.resolvedModelName,
        valueTone: null,
        valueClassName: 'status-effective-model',
        nowrapValue: true,
        menuItems: modelMenuItems,
      }),
      kvRow({
        label: 'Source',
        labelClassName: 'status-effective-model',
        value: d.effectiveModelSource,
        valueTone: d.effectiveModelSource === 'override' ? 'info' : 'muted',
        valueClassName: 'status-effective-model',
        nowrapValue: true,
      }),
    );
  }

  rows.push(
    kvRow({
      label: 'Workspace',
      value: d.workspace,
      valueTone: null,
      nowrapValue: true,
    }),
    kvRow({
      label: 'Transport',
      value: d.transport,
      valueTone: null,
      nowrapValue: true,
    }),
    kvRow({
      label: 'Relays',
      value: d.botRelayUrls.length > 0 ? d.botRelayUrls.join(', ') : '(none)',
      valueTone: 'muted',
    }),
    kvRow({
      label: 'Version',
      value: d.version,
      valueTone: null,
      nowrapValue: true,
    }),
  );

  if (d.opencodeServeUrl) {
    rows.push(
      kvRow({
        label: 'Serve',
        value: `${d.opencodeServeUrl} (attached)`,
        valueTone: 'info',
        nowrapValue: true,
      }),
    );
  }

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'bot', subcommand: 'status' },
    stylesheets: [
      {
        id: 'bot-status-rows',
        cssText: `
          .status-kv-row {
            padding: 0.3rem 0.45rem;
            border-radius: 2px;
          }

          .status-kv-row--nowrap {
            flex-wrap: nowrap;
          }

          .status-kv-row:nth-child(even) {
            background: rgba(255, 255, 255, 0.05);
          }

          .status-kv-row > .web-node:first-child {
            white-space: nowrap;
          }

          .status-kv-row--nowrap > .web-row:last-child {
            flex-wrap: nowrap;
            justify-content: flex-end;
            min-width: 0;
          }

          .status-kv-row--nowrap .web-text,
          .status-kv-row--nowrap .web-overflow-menu,
          .status-kv-row--nowrap .status-value-trigger {
            white-space: nowrap;
          }

          .status-value-trigger {
            opacity: 1;
            color: var(--color-accent);
            cursor: pointer;
            pointer-events: auto;
            text-underline-offset: 2px;
          }

          .status-value-trigger:hover,
          .status-value-trigger:focus-visible {
            color: #fff;
          }

          .status-effective-model {
            font-weight: 700;
          }
        `.trim(),
      },
    ],
    tree: stack(rows, 'sm'),
  };
}
