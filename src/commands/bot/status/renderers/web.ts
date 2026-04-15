import type { WebRenderContext } from '@src/system/render-context';
import { formatMsats, msats } from '@src/types';
import type { WebNode, WebNodeRoot, WebTone } from '@src/web/ui-schema';
import { stack, textBlock } from '@src/web/widgets';

import type { BotStatusRepresentation } from '../representation';

type KvRowProps = {
  label: string;
  value: string;
  valueTone: WebTone | null;
};

function kvRow({ label, value, valueTone }: KvRowProps): WebNode {
  return {
    type: 'element',
    tag: 'row',
    props: {
      align: 'between',
      gap: 'md',
    },
    children: [
      textBlock(label, 'muted'),
      textBlock(value, valueTone ?? undefined),
    ],
  };
}

export function renderBotStatusWeb(
  representation: BotStatusRepresentation,
  _context: WebRenderContext,
): WebNodeRoot {
  const d = representation.data;

  const modelValue = d.modelOverride
    ? `${d.modelOverride} (override)`
    : d.resolvedModelName;

  const providerValue =
    d.provider === 'routstr'
      ? `routstr (budget: ${formatMsats(msats(d.routstrBudgetMsatsRaw ?? 0))})`
      : 'local';

  const rows: WebNode[] = [
    kvRow({
      label: 'Backend',
      value: d.backend,
      valueTone: 'info',
    }),
    kvRow({
      label: 'Provider',
      value: providerValue,
      valueTone: d.provider === 'routstr' ? 'info' : 'muted',
    }),
    kvRow({
      label: 'Version',
      value: d.version,
      valueTone: null,
    }),
    kvRow({
      label: 'Mode',
      value: d.mode,
      valueTone: null,
    }),
    kvRow({
      label: 'Linting',
      value: d.linting,
      valueTone: d.linting === 'on' ? 'success' : 'muted',
    }),
    kvRow({
      label: 'Model',
      value: modelValue,
      valueTone: null,
    }),
    kvRow({
      label: 'Workspace',
      value: d.workspace,
      valueTone: null,
    }),
    kvRow({
      label: 'Transport',
      value: d.transport,
      valueTone: null,
    }),
    kvRow({
      label: 'Relays',
      value: d.botRelayUrls.length > 0 ? d.botRelayUrls.join(', ') : '(none)',
      valueTone: 'muted',
    }),
    kvRow({
      label: 'Session',
      value: d.sessionId ?? '(none)',
      valueTone: d.sessionId ? 'info' : 'muted',
    }),
  ];

  if (d.opencodeServeUrl) {
    rows.push(
      kvRow({
        label: 'Serve',
        value: `${d.opencodeServeUrl} (attached)`,
        valueTone: 'info',
      }),
    );
  }

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'bot', subcommand: 'status' },
    tree: stack(rows, 'sm'),
  };
}
