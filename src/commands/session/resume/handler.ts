import type { CoreDb, WorkspaceTarget } from '@src/db';
import { setCurrentSession } from '@src/session';

import type { SessionResumeRepresentation } from './representation';

type HandleSessionResumeProps = {
  db: CoreDb;
  sessionId: string;
  prefix: string;
  workspace: WorkspaceTarget;
  selection: 'web' | 'dm';
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

  if (!setCurrentSession(db, sessionId, props.workspace, props.selection)) {
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
