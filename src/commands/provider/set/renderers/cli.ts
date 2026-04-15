import type { TextRenderContext } from '@src/system/render-context';

import type { ProviderSetRepresentation } from '../representation';

export function renderProviderSetCli(
  representation: ProviderSetRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}ai provider set [${d.providerOpts}]`;
    case 'invalid':
      return `Invalid provider: ${d.name}. Use: ${d.providerOpts}`;
    case 'local':
      return 'Provider set to: local';
    case 'routstr': {
      const lines = ['Provider set to: routstr'];

      lines.push(
        d.hasSessionKey
          ? `Session key: ${d.sessionKeyPreview ?? ''}`
          : 'No session yet. Use ai provider deposit <sats> or append !!<sats> to your prompt.',
      );

      return lines.join('\n');
    }

    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
