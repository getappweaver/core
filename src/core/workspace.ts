import { getWorkspaceTarget, openCoreDb } from '@src/db';
import { dmBotRoot, getParentWorkspaceRoot } from '@src/paths';

/** Resolve the active workspace for tools running without a PluginContext. */
export function resolveActiveWorkspaceRoot(): string {
  const db = openCoreDb();
  try {
    return getWorkspaceTarget(db) === 'appweaver'
      ? dmBotRoot
      : getParentWorkspaceRoot();
  } finally {
    db.close();
  }
}
