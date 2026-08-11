import type { CoreDb, WorkspaceTarget } from './shared';

const DEFAULT_PARENT_WORKSPACE_INSTRUCTIONS = `Work only within the active workspace.

Understand the existing project before making changes. Preserve established patterns and avoid modifying unrelated work.

Treat questions and brainstorming as discussion. Only edit files when the user clearly requests implementation.

When implementing, carry the requested change through appropriate verification and report anything that could not be verified.`;

const DEFAULT_WORKSPACE_INSTRUCTIONS: Record<WorkspaceTarget, string> = {
  parent: DEFAULT_PARENT_WORKSPACE_INSTRUCTIONS,
  appweaver: '',
};

export type WorkspaceInstructions = {
  instructions: string;
  customized: boolean;
};

export function createWorkspaceInstructionsTable(db: CoreDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS workspace_instructions (
      workspace TEXT PRIMARY KEY CHECK (workspace IN ('parent', 'appweaver')),
      instructions TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

export function getWorkspaceInstructions(
  db: CoreDb,
  workspace: WorkspaceTarget,
): WorkspaceInstructions {
  const row = db
    .prepare(
      'SELECT instructions FROM workspace_instructions WHERE workspace = ?',
    )
    .get(workspace) as { instructions: string } | null;

  return row
    ? { instructions: row.instructions, customized: true }
    : {
        instructions: DEFAULT_WORKSPACE_INSTRUCTIONS[workspace],
        customized: false,
      };
}

export function setWorkspaceInstructions(
  db: CoreDb,
  workspace: WorkspaceTarget,
  instructions: string,
): void {
  db.prepare(
    `INSERT INTO workspace_instructions (workspace, instructions, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(workspace) DO UPDATE SET
       instructions = excluded.instructions,
       updated_at = excluded.updated_at`,
  ).run(workspace, instructions, Date.now());
}

export function resetWorkspaceInstructions(
  db: CoreDb,
  workspace: WorkspaceTarget,
): void {
  db.prepare('DELETE FROM workspace_instructions WHERE workspace = ?').run(
    workspace,
  );
}
