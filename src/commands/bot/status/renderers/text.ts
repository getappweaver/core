import { C } from '@src/logger';
import type { TextRenderContext } from '@src/system/render-context';

import type { BotStatusRepresentation } from '../representation';

export function renderBotStatusText(
  representation: BotStatusRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  const label = (name: string) =>
    `${C.bold}${(name + ':').padEnd(18)}${C.reset}`;

  const update = d.coreUpdate;

  const version = !update
    ? d.version
    : update.state === 'available'
      ? `${update.localVersion ?? d.version} -> ${update.remoteVersion ?? update.remoteRef ?? 'remote'} - ${update.updateLevel === 'same' || update.updateLevel === 'unknown' ? 'update' : `${update.updateLevel} update`} available`
      : update.state === 'checking'
        ? `${d.version} - checking`
        : update.state === 'unavailable'
          ? `${d.version} - check unavailable`
          : `${update.localVersion ?? d.version} - up to date`;

  const lines = [
    `${label('Workspace')} ${d.workspace}`,
    `${label('Session')} ${d.sessionId ?? '(none)'}`,
    `${label('Linting')} ${d.linting}`,
    `${label('Version')} ${version}`,
    `${label('Relays')} ${d.botRelayUrls.length > 0 ? d.botRelayUrls.join(', ') : '(none)'}`,
  ];

  if (d.opencodeServeUrl) {
    lines.push(`${label('Serve')} ${d.opencodeServeUrl} (attached)`);
  }

  if (d.coreUpdate?.message) {
    lines.push(`${label('Update')} ${d.coreUpdate.message}`);
  }

  return lines.join('\n');
}
