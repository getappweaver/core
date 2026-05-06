// ---------------------------------------------------------------------------
// src/commands/prefixed-handlers.ts — merge root builtin handler maps
// ---------------------------------------------------------------------------

import { handleAiRoot } from './ai/handler';
import { handleBotRoot } from './bot/handler';
import { handleBunkerRoot } from './bunker/handler';
import type { BuiltinHandler } from './dispatch';
import { handleHelpRoot } from './help/handlers';
import { handlePluginsRoot } from './plugin-manager/handler';
import { handleRoadmapRoot } from './roadmap/handler';
import { handleSessionRoot } from './session/handler';
import { handleStoryRoot } from './story/handler';
import { handleWalletRoot } from './wallet/handler';
import { handleWotRoot } from './wot/handlers';

/**
 * Core built-in commands (first token after the command prefix).
 * Plugin aliases must not collide with these names.
 */
export const builtinCommandHandlers: Record<string, BuiltinHandler> = {
  help: handleHelpRoot,
  session: handleSessionRoot,
  story: handleStoryRoot,
  bot: handleBotRoot,
  plugins: handlePluginsRoot,
  plugin: handlePluginsRoot,
  roadmap: handleRoadmapRoot,
  ai: handleAiRoot,
  wallet: handleWalletRoot,
  bunker: handleBunkerRoot,
  wot: handleWotRoot,
};
