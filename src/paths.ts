// ---------------------------------------------------------------------------
// paths.ts — Shared path utilities
// ---------------------------------------------------------------------------
import { dirname, join, parse, resolve } from 'path';

const srcDir = import.meta.dir;
const dmBotRootDir = join(srcDir, '..');

export const dmBotRoot = dmBotRootDir;
export const CORE_DB_PATH = join(dmBotRootDir, 'dm-bot.sqlite');
export const RESTART_REQUESTED_PATH = join(dmBotRootDir, 'restart.requested');

export function getParentWorkspaceRoot(botRoot: string = dmBotRootDir): string {
  const resolvedBotRoot = resolve(botRoot);
  const parentRoot = dirname(resolvedBotRoot);

  return parentRoot === parse(resolvedBotRoot).root
    ? resolvedBotRoot
    : parentRoot;
}
