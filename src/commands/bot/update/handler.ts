import type { WebHandlerResult } from '@src/web/ui-schema';

import type { RouteCommandContext } from '../../dispatch';
import { handleError } from '../../dispatch';

import { writeRestartRequestedFile } from '../request-watch-restart';

function formatPullOutput(output: string): string | null {
  const trimmed = output.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.length > 800 ? `${trimmed.slice(0, 800)}…` : trimmed;
}

export function handleBotUpdate(
  ctx: RouteCommandContext,
): Promise<WebHandlerResult> {
  return handleError(async () => {
    if (!ctx.coreUpdateChecker) {
      return 'Core update is unavailable.';
    }

    const result = await ctx.coreUpdateChecker.updateNow();
    const lines = ['Core update complete.'];

    if (result.beforeRef && result.afterRef) {
      lines.push(`Local: ${result.beforeRef} → ${result.afterRef}`);
    }

    if (result.upstream) {
      lines.push(`Upstream: ${result.upstream}`);
    }

    const pullOutput = formatPullOutput(result.pullOutput);

    if (pullOutput) {
      lines.push(pullOutput);
    }

    if (!result.pulled) {
      lines.push('No restart requested because AppWeaver was already current.');

      return lines.join('\n');
    }

    writeRestartRequestedFile();

    lines.push(
      'Restart requested. If running under watch, the bot will restart shortly.',
    );

    return lines.join('\n');
  }, 'Failed to update AppWeaver');
}
