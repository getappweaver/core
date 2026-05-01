import {
  getAgentBackend,
  setDefaultMode,
  setSelectedOpencodeAgent,
} from '@src/db';
import type { WebHandlerResult } from '@src/web/ui-schema';

import { handleError, type RouteCommandContext } from '../../dispatch';
import { appendStatusBlock } from '../../shared/with-status';

import { renderAiModeCli } from './renderers/cli';
import { buildAiModeRepresentation } from './representation';

export async function handleAiMode(
  ctx: RouteCommandContext,
): Promise<WebHandlerResult> {
  return handleError(async () => {
    const modeArg = (ctx.args[1] ?? '').toLowerCase();

    const rep = buildAiModeRepresentation({
      modeArg,
      prefix: ctx.prefix,
    });

    if (rep.data.view === 'set') {
      setDefaultMode(ctx.seenDb, rep.data.mode);

      const backendName = getAgentBackend(ctx.seenDb);

      if (backendName !== 'cursor') {
        setSelectedOpencodeAgent(ctx.seenDb, rep.data.mode);
      }
    }

    const out = renderAiModeCli(rep, { prefix: ctx.prefix });

    if (rep.data.view === 'usage') {
      return out;
    }

    return appendStatusBlock(ctx, out);
  }, 'Failed to set mode');
}
