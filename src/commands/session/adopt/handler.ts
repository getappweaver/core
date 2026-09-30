import { opencodeRuntimeController } from '@src/backends/opencode-runtime-controller';
import { getOpencodeSdkClient } from '@src/backends/opencode-sdk';
import type { AgentBackendName, CoreDb, WorkspaceTarget } from '@src/db';
import { setCurrentSession } from '@src/session';

import type { SessionAdoptRepresentation } from './representation';

type HandleSessionAdoptProps = {
  db: CoreDb;
  sessionId: string;
  prefix: string;
  activeBackend: AgentBackendName;
  cwd: string;
  workspace: WorkspaceTarget;
  selection: 'web' | 'dm';
};

export async function handleSessionAdopt({
  db,
  sessionId,
  prefix,
  activeBackend,
  cwd,
  workspace,
  selection,
}: HandleSessionAdoptProps): Promise<SessionAdoptRepresentation> {
  if (!sessionId) {
    return {
      kind: 'session.adopt',
      version: 1,
      meta: { command: 'session', subcommand: 'adopt' },
      data: { view: 'usage', prefix },
    };
  }

  if (activeBackend !== 'opencode') {
    return {
      kind: 'session.adopt',
      version: 1,
      meta: { command: 'session', subcommand: 'adopt' },
      data: { view: 'backend-mismatch', prefix, activeBackend },
    };
  }

  try {
    const result = await opencodeRuntimeController.withAdmission(async () => {
      const opencode = await getOpencodeSdkClient();

      return opencode.session.get({ sessionID: sessionId, directory: cwd });
    });

    const session = result.data;

    if (!session) {
      return {
        kind: 'session.adopt',
        version: 1,
        meta: { command: 'session', subcommand: 'adopt' },
        data: { view: 'not-found', sessionId },
      };
    }

    db.run(
      'INSERT OR IGNORE INTO sessions (id, created_at, backend, workspace, updated_at) VALUES (?, ?, ?, ?, ?)',
      [
        session.id,
        Math.floor(session.time.created / 1000),
        'opencode',
        workspace,
        Math.floor(session.time.updated / 1000),
      ],
    );

    db.run(
      'UPDATE sessions SET workspace = ? WHERE id = ? AND workspace IS NULL',
      [workspace, session.id],
    );

    if (!setCurrentSession(db, session.id, workspace, selection)) {
      throw new Error('Session belongs to a different workspace.');
    }

    return {
      kind: 'session.adopt',
      version: 1,
      meta: { command: 'session', subcommand: 'adopt' },
      data: {
        view: 'success',
        sessionId: session.id,
        title: session.title,
      },
    };
  } catch (err) {
    if (String(err).includes('404') || String(err).includes('NotFound')) {
      return {
        kind: 'session.adopt',
        version: 1,
        meta: { command: 'session', subcommand: 'adopt' },
        data: { view: 'not-found', sessionId },
      };
    }

    throw err;
  }
}
