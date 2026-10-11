import { announceProcessRestart } from '@src/process-restart-notifications';
import type { WebHandlerResult } from '@src/web/ui-schema';

import { handleError, type RouteCommandContext } from '../../dispatch';

import {
  WATCH_RESTART_ACK_MESSAGE,
  writeRestartRequestedFile,
} from '../request-watch-restart';

export function handleBotRestart(
  ctx: Pick<RouteCommandContext, 'source'>,
): Promise<WebHandlerResult> {
  return handleError(async () => {
    writeRestartRequestedFile();
    const view = announceProcessRestart();

    if (ctx.source === 'web') {
      return view;
    }

    return WATCH_RESTART_ACK_MESSAGE;
  }, 'Failed to request restart');
}
