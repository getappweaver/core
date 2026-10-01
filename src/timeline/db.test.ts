import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { CoreDb } from '@src/db';

import {
  createTimelineTables,
  getSessionUnreadWindow,
  insertTimelineEvent,
  listTimelineHistoryLatest,
  markSessionRead,
} from './db';

describe('session-bound timelines', () => {
  let sqlite: Database;
  let db: CoreDb;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = sqlite as CoreDb;

    sqlite.run(
      'CREATE TABLE sessions (id TEXT PRIMARY KEY, updated_at INTEGER, last_read_message_created_at INTEGER, last_read_message_id TEXT)',
    );

    createTimelineTables(db);
  });

  afterEach(() => sqlite.close());

  function addAssistant(sessionId: string, id: string, createdAt?: number) {
    insertTimelineEvent(db, {
      id,
      createdAt,
      sessionId,
      timelineId: sessionId,
      source: 'web',
      kind: 'chat',
      role: 'assistant',
      command: null,
      subcommand: null,
      subcommandTag: null,
      values: null,
      form: null,
      text: id,
      web: null,
      clientView: null,
      prompt: null,
      requestId: null,
    });
  }

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

  test('tracks A and B independently and does not repeat read messages', () => {
    sqlite.run(
      'INSERT INTO sessions (id, last_read_message_created_at, last_read_message_id) VALUES (?, 0, ?), (?, 0, ?)',
      ['a', '', 'b', ''],
    );

    addAssistant('a', 'a-old', 100);
    addAssistant('b', 'b-old', 100);
    markSessionRead(db, 'a', 'a-old');
    markSessionRead(db, 'b', 'b-old');

    for (let n = 1; n <= 3; n += 1) {
      addAssistant('a', `a-${n}`, 100 + n);
    }

    for (let n = 1; n <= 5; n += 1) {
      addAssistant('b', `b-${n}`, 100 + n);
    }

    expect(getSessionUnreadWindow(db, 'a', 2)).toEqual({
      firstUnreadId: 'a-1',
      limit: 23,
    });

    expect(getSessionUnreadWindow(db, 'b', 2).firstUnreadId).toBe('b-1');

    markSessionRead(db, 'a', 'a-3');
    markSessionRead(db, 'a', 'a-old');

    expect(getSessionUnreadWindow(db, 'a', 2).firstUnreadId).toBeNull();
    expect(getSessionUnreadWindow(db, 'b', 2).firstUnreadId).toBe('b-1');

    addAssistant('a', 'a-next', 103);

    expect(getSessionUnreadWindow(db, 'a', 2).firstUnreadId).toBe('a-next');
  });

  test('older sessions without a cursor start read and track later arrivals', () => {
    sqlite.run("INSERT INTO sessions (id) VALUES ('old')");
    addAssistant('old', 'historical', 500);

    expect(getSessionUnreadWindow(db, 'old', 100).firstUnreadId).toBeNull();

    markSessionRead(db, 'old', 'historical');
    addAssistant('old', 'new', 501);

    expect(getSessionUnreadWindow(db, 'old', 100).firstUnreadId).toBe('new');
  });

  test('assigns monotonic timestamps when responses arrive within one millisecond', () => {
    sqlite.run(
      "INSERT INTO sessions (id, last_read_message_created_at, last_read_message_id) VALUES ('a', 0, '')",
    );

    addAssistant('a', 'z-response', Date.now() + 1000);
    markSessionRead(db, 'a', 'z-response');
    addAssistant('a', 'a-response');

    expect(getSessionUnreadWindow(db, 'a', 100).firstUnreadId).toBe(
      'a-response',
    );
  });
});
