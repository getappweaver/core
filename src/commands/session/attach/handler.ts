import type { AgentBackendName, CoreDb } from '@src/db';
import { setCurrentSession } from '@src/session';

import type { SessionAttachRepresentation } from './representation';

type HandleSessionAttachProps = {
  db: CoreDb;
  targetBackend: string;
  sessionId: string;
  prefix: string;
  activeBackend: AgentBackendName;
};

export function handleSessionAttach(
  props: HandleSessionAttachProps,
): SessionAttachRepresentation {
  const { db, targetBackend, sessionId, prefix, activeBackend } = props;
  const normalizedTarget = targetBackend.toLowerCase();

  if (!targetBackend || !sessionId) {
    return {
      kind: 'session.attach',
      version: 1,
      meta: { command: 'session', subcommand: 'attach' },
      data: { view: 'usage', prefix },
    };
  }

  if (normalizedTarget !== 'opencode') {
    return {
      kind: 'session.attach',
      version: 1,
      meta: { command: 'session', subcommand: 'attach' },
      data: { view: 'usage', prefix },
    };
  }

  if (activeBackend !== 'opencode') {
    return {
      kind: 'session.attach',
      version: 1,
      meta: { command: 'session', subcommand: 'attach' },
      data: { view: 'backend-mismatch', prefix, activeBackend },
    };
  }

  const now = Math.floor(Date.now() / 1000);

  db.run(
    'INSERT OR IGNORE INTO sessions (id, created_at, backend) VALUES (?, ?, ?)',
    [sessionId, now, activeBackend],
  );

  if (!setCurrentSession(db, sessionId)) {
    throw new Error(`Failed to attach session ${sessionId}`);
  }

  return {
    kind: 'session.attach',
    version: 1,
    meta: { command: 'session', subcommand: 'attach' },
    data: {
      view: 'success',
      sessionId,
      attachedToBackend: activeBackend,
    },
  };
}
