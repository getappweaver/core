import { PROCESS_INSTANCE_ID } from '@src/process-instance';
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

    if (ctx.source === 'web') {
      return {
        kind: 'client_view',
        version: 1,
        view: 'process-restart',
        meta: { command: 'bot', subcommand: 'restart' },
        payload: { instanceId: PROCESS_INSTANCE_ID, requestedAt: Date.now() },
      };
    }

    return WATCH_RESTART_ACK_MESSAGE;
  }, 'Failed to request restart');
}
