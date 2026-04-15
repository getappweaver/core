import type {
  AgentBackendName,
  AgentMode,
  Linting,
  ProviderName,
  ReplyTransport,
  WorkspaceTarget,
} from '@src/db';
import { C } from '@src/logger';
import type { TextRenderContext } from '@src/system/render-context';
import { formatMsats, msats } from '@src/types';

import type { BotStatusRepresentation } from '../representation';

const STATUS_EMOJI = {
  backend: (v: AgentBackendName) =>
    v === 'cursor' ? '🖱️' : v === 'opencode-sdk' ? '📦 (SDK)' : '📦',
  provider: (v: ProviderName) => (v === 'local' ? '💻' : '🌐'),
  mode: (v: AgentMode) =>
    ({ free: '🆓', ask: '💬', plan: '📋', agent: '🤖' })[v],
  linting: (v: Linting) => (v === 'on' ? '✅' : '❌'),
  workspace: (v: WorkspaceTarget) => (v === 'bot' ? '🤖' : '📁'),
  transport: (v: ReplyTransport) => (v === 'remote' ? '📡' : '💻'),
} as const;

export function renderBotStatusText(
  representation: BotStatusRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;
  const col = 14;

  const lbl = (name: string) =>
    `${C.bold}${(name + ':').padEnd(col)}${C.reset}`;

  const modelDisplay = d.modelOverride
    ? `${d.modelOverride} ${C.gray}(override)${C.reset}`
    : d.resolvedModelName;

  const providerDisplay =
    d.provider === 'routstr'
      ? `${STATUS_EMOJI.provider('routstr')} ${C.magenta}routstr${C.reset} (budget: ${formatMsats(msats(d.routstrBudgetMsatsRaw ?? 0))})`
      : `${STATUS_EMOJI.provider('local')} local`;

  const lines = [
    `${lbl('Backend')} ${STATUS_EMOJI.backend(d.backend)} ${C.magenta}${d.backend}${C.reset}`,
    `${lbl('Provider')} ${providerDisplay}`,
    `${lbl('Version')} ${d.version}`,
    `${lbl('Mode')} ${STATUS_EMOJI.mode(d.mode)} ${d.mode}`,
    `${lbl('Linting')} ${STATUS_EMOJI.linting(d.linting)} ${d.linting}`,
    `${lbl('Model')} ${modelDisplay}`,
    `${lbl('Workspace')} ${STATUS_EMOJI.workspace(d.workspace)} ${d.workspace}`,
    `${lbl('Transport')} ${STATUS_EMOJI.transport(d.transport)} ${d.transport}`,
    `${lbl('Relays')} ${d.botRelayUrls.join(', ')}`,
    `${lbl('Session')} ${d.sessionId ?? `${C.gray}(none)${C.reset}`}`,
  ];

  if (d.opencodeServeUrl) {
    lines.push(`${lbl('Serve')} ${d.opencodeServeUrl} (attached)`);
  }

  return lines.join('\n');
}
