import type { CoreDb } from '@src/db';
import { setCurrentSession } from '@src/session';

import type { SessionResumeRepresentation } from './representation';

type HandleSessionResumeProps = {
  db: CoreDb;
  sessionId: string;
  prefix: string;
};

export function handleSessionResume(
  props: HandleSessionResumeProps,
): SessionResumeRepresentation {
  const { db, sessionId, prefix } = props;

  if (!sessionId) {
    return {
      kind: 'session.resume',
      version: 1,
      meta: { command: 'session', subcommand: 'resume' },
      data: { view: 'usage', prefix },
    };
  }

  if (!setCurrentSession(db, sessionId)) {
    return {
      kind: 'session.resume',
      version: 1,
      meta: { command: 'session', subcommand: 'resume' },
      data: { view: 'not-found' },
    };
  }

  return {
    kind: 'session.resume',
    version: 1,
    meta: { command: 'session', subcommand: 'resume' },
    data: { view: 'success', sessionId },
  };
}
