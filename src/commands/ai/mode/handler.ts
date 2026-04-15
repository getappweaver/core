import { setDefaultMode } from '@src/db';
import type { WebNodeRoot } from '@src/web/ui-schema';

import type { RouteCommandContext } from '../../dispatch';
import { handleError } from '../../dispatch';
import { appendStatusBlock } from '../../shared/with-status';

import { renderAiModeCli } from './renderers/cli';
import { buildAiModeRepresentation } from './representation';

export async function handleAiMode(
  ctx: RouteCommandContext,
): Promise<string | WebNodeRoot> {
  return handleError(async () => {
    const modeArg = (ctx.args[1] ?? '').toLowerCase();

    const rep = buildAiModeRepresentation({
      modeArg,
      prefix: ctx.prefix,
    });

    if (rep.data.view === 'set') {
      setDefaultMode(ctx.seenDb, rep.data.mode);
    }

    const out = renderAiModeCli(rep, { prefix: ctx.prefix });

    if (rep.data.view === 'usage') {
      return out;
    }

    return appendStatusBlock(ctx, out);
  }, 'Failed to set mode');
}
