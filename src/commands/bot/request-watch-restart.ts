// ---------------------------------------------------------------------------
// Touch restart.requested for scripts/run-with-restart.ts (bun run watch).
// ---------------------------------------------------------------------------

import { writeFileSync } from 'fs';

import { RESTART_REQUESTED_PATH } from '@src/paths';

export function writeRestartRequestedFile(): void {
  writeFileSync(RESTART_REQUESTED_PATH, '', 'utf-8');
}

export const WATCH_RESTART_ACK_MESSAGE =
  'Restart requested. If running under watch, the bot will restart shortly.';
