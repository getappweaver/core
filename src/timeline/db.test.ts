import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { CoreDb } from '@src/db';

import {
  createTimelineTables,
  insertTimelineEvent,
  listTimelineHistoryLatest,
} from './db';

describe('session-bound timelines', () => {
  let sqlite: Database;
  let db: CoreDb;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = sqlite as CoreDb;

    sqlite.run(
      'CREATE TABLE sessions (id TEXT PRIMARY KEY, updated_at INTEGER)',
    );

    createTimelineTables(db);
  });

  afterEach(() => sqlite.close());

  test('only loads activity owned by the selected session, ignoring old unscoped rows', () => {
    sqlite.run('INSERT INTO sessions (id) VALUES (?), (?)', ['a', 'b']);

    sqlite.run(
      "INSERT INTO timeline_events (id, timeline_id, source, kind, text, created_at) VALUES ('legacy', 'a', 'web', 'system', 'old activity', 1)",
    );

    for (const sessionId of ['a', 'b']) {
      insertTimelineEvent(db, {
        sessionId,
        timelineId: sessionId,
        source: 'web',
        kind: 'chat',
        role: 'user',
        command: null,
        subcommand: null,
        subcommandTag: null,
        values: null,
        form: null,
        text: `message ${sessionId}`,
        web: null,
        clientView: null,
        prompt: null,
        requestId: null,
      });
    }

    expect(
      listTimelineHistoryLatest(db, 'a', 100).items.map((item) => item.id),
    ).toHaveLength(1);

    expect(listTimelineHistoryLatest(db, 'a', 100).items[0]).toMatchObject({
      text: 'message a',
    });

    expect(listTimelineHistoryLatest(db, 'b', 100).items[0]).toMatchObject({
      text: 'message b',
    });
  });

  test('rejects mismatched session and timeline identities', () => {
    expect(() =>
      insertTimelineEvent(db, {
        sessionId: 'a',
        timelineId: 'b',
        source: 'web',
        kind: 'system',
        role: null,
        command: null,
        subcommand: null,
        subcommandTag: null,
        values: null,
        form: null,
        text: 'wrong feed',
        web: null,
        clientView: null,
        prompt: null,
        requestId: null,
      }),
    ).toThrow('Timeline must match its session.');
  });
});
