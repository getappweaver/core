import type { CoreDb } from '@src/db';

import type { SessionMessagesRepresentation } from './representation';

type HandleSessionMessagesProps = {
  db: CoreDb;
  sessionId: string;
  n: number;
  prefix: string;
};

export function handleSessionMessages(
  props: HandleSessionMessagesProps,
): SessionMessagesRepresentation {
  const { db, sessionId, n, prefix } = props;

  if (!sessionId) {
    return {
      kind: 'session.messages',
      version: 1,
      meta: { command: 'session', subcommand: 'messages' },
      data: { view: 'usage', prefix },
    };
  }

  const rows = db
    .prepare(
      'SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
    )
    .all(sessionId, n) as { role: string; content: string }[];

  if (rows.length === 0) {
    return {
      kind: 'session.messages',
      version: 1,
      meta: { command: 'session', subcommand: 'messages' },
      data: { view: 'empty' },
    };
  }

  return {
    kind: 'session.messages',
    version: 1,
    meta: { command: 'session', subcommand: 'messages' },
    data: {
      view: 'transcript',
      lines: rows.reverse().map((r) => ({
        role: r.role,
        contentPreview: `${r.content.slice(0, 500)}${r.content.length > 500 ? '…' : ''}`,
      })),
    },
  };
}
