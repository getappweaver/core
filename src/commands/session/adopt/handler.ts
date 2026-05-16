import { createOpencode } from '@opencode-ai/sdk/v2';

import type { AgentBackendName, CoreDb } from '@src/db';
import { setState, STATE_CURRENT_SESSION } from '@src/db';

import type { SessionAdoptRepresentation } from './representation';

type HandleSessionAdoptProps = {
  db: CoreDb;
  sessionId: string;
  prefix: string;
  activeBackend: AgentBackendName;
  cwd: string;
};

export async function handleSessionAdopt({
  db,
  sessionId,
  prefix,
  activeBackend,
  cwd,
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

  const opencode = await createOpencode({});

  try {
    const result = await opencode.client.session.get({
      sessionID: sessionId,
      directory: cwd,
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
      'INSERT OR IGNORE INTO sessions (id, created_at, backend) VALUES (?, ?, ?)',
      [session.id, Math.floor(session.time.created / 1000), 'opencode'],
    );

    setState(db, STATE_CURRENT_SESSION, session.id);

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
  } finally {
    opencode.server.close();
  }
}
