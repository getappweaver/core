import type { AgentBackend } from '@src/backends/types';
import type { CoreDb } from '@src/db';
import { createNewSession } from '@src/session';

import type { SessionNewRepresentation } from './representation';

type HandleSessionNewProps = {
  seenDb: CoreDb;
  backend: AgentBackend;
  cwd: string;
};

export async function handleSessionNew(
  props: HandleSessionNewProps,
): Promise<SessionNewRepresentation> {
  const id = await createNewSession({
    db: props.seenDb,
    backend: props.backend,
    cwd: props.cwd,
  });

  return {
    kind: 'session.new',
    version: 1,
    meta: { command: 'session', subcommand: 'new' },
    data: { sessionId: id },
  };
}
