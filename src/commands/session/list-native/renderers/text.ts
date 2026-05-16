import type { TextRenderContext } from '@src/system/render-context';

import type { SessionListNativeRepresentation } from '../representation';

type NativeSessionRow = Extract<
  SessionListNativeRepresentation['data'],
  { view: 'rows' }
>['rows'][number];

function formatChangeSummary(row: NativeSessionRow): string {
  if (
    row.filesChanged === null ||
    row.additions === null ||
    row.deletions === null
  ) {
    return '';
  }

  return ` · ${row.filesChanged} files, +${row.additions}/-${row.deletions}`;
}

export function renderSessionListNativeText(
  representation: SessionListNativeRepresentation,
  _context: TextRenderContext,
): string {
  const d = representation.data;

  switch (d.view) {
    case 'usage':
      return `Usage: ${d.prefix}session list-native --opencode`;
    case 'backend-unsupported':
      return `Native session listing is not implemented for ${d.backend}. Use --opencode.`;
    case 'empty':
      return `No native OpenCode sessions found for ${d.directory}.`;
    case 'rows':
      return [
        `Native OpenCode sessions for ${d.directory}:`,
        '',
        ...d.rows.map((r) => {
          const model = r.model ? ` · ${r.model}` : '';
          const agent = r.agent ? ` · agent: ${r.agent}` : '';
          const tracked = r.isTracked ? ' · tracked' : '';
          const current = r.isCurrent ? ' · current' : '';

          return `${r.id}\n  ${r.title}\n  updated ${r.updatedAtIso}${agent}${model}${formatChangeSummary(r)}${tracked}${current}`;
        }),
        '',
        `Adopt one with: ${_context.prefix}session adopt <session_id>`,
      ].join('\n');
    default: {
      const _exhaustive: never = d;

      return _exhaustive;
    }
  }
}
