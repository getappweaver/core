// ---------------------------------------------------------------------------
// src/commands/prefixed-handlers.ts — merge root builtin handler maps
// ---------------------------------------------------------------------------

import { handleAiRoot } from './ai/handler';
import { handleBotRoot } from './bot/handler';
import { handleBunkerRoot } from './bunker/handler';
import type { BuiltinHandler } from './dispatch';
import { handleHelpRoot } from './help/handlers';
import { handleSessionRoot } from './session/handler';
import { handleWalletRoot } from './wallet/handler';
import { handleWotRoot } from './wot/handlers';

/**
 * Core built-in commands (first token after the command prefix).
 * Plugin aliases must not collide with these names.
 */
export const builtinCommandHandlers: Record<string, BuiltinHandler> = {
  help: handleHelpRoot,
  session: handleSessionRoot,
  bot: handleBotRoot,
  ai: handleAiRoot,
  wallet: handleWalletRoot,
  bunker: handleBunkerRoot,
  wot: handleWotRoot,
};
