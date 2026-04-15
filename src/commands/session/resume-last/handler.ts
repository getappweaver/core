import type { AgentBackendName, CoreDb } from '@src/db';
import { getLatestSession, setCurrentSession } from '@src/session';

import type { SessionResumeLastRepresentation } from './representation';

type HandleSessionResumeLastProps = {
  db: CoreDb;
  backendName: AgentBackendName;
};

export function handleSessionResumeLast(
  props: HandleSessionResumeLastProps,
): SessionResumeLastRepresentation {
  const id = getLatestSession(props.db, props.backendName);

  if (!id) {
    return {
      kind: 'session.resume-last',
      version: 1,
      meta: { command: 'session', subcommand: 'resume-last' },
      data: { view: 'empty', backendName: props.backendName },
    };
  }

  setCurrentSession(props.db, id);

  return {
    kind: 'session.resume-last',
    version: 1,
    meta: { command: 'session', subcommand: 'resume-last' },
    data: { view: 'success', sessionId: id },
  };
}
