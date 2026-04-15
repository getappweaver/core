import type { WebNodeRoot } from '@src/web/ui-schema';

import { handleError } from '../../dispatch';

import {
  WATCH_RESTART_ACK_MESSAGE,
  writeRestartRequestedFile,
} from '../request-watch-restart';

export function handleBotRestart(): Promise<string | WebNodeRoot> {
  return handleError(async () => {
    writeRestartRequestedFile();

    return WATCH_RESTART_ACK_MESSAGE;
  }, 'Failed to request restart');
}
