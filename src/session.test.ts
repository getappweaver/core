import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { AgentBackend } from './backends/types';
import type { CoreDb } from './db';
import { getState, STATE_CURRENT_SESSION, webSessionStateKey } from './db';
import {
  assertWebSession,
  getOrCreateCurrentSession,
  listAppWeaverSessions,
  renameAppWeaverSession,
  setCurrentSession,
} from './session';

describe('session selection', () => {
  let sqlite: Database;
  let db: CoreDb;
  let nextId: number;
  let backend: AgentBackend;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = sqlite as CoreDb;
    nextId = 0;

    sqlite.run(
      "CREATE TABLE sessions (id TEXT PRIMARY KEY, created_at INTEGER, backend TEXT, workspace TEXT, updated_at INTEGER, title TEXT, title_origin TEXT NOT NULL DEFAULT 'manual', last_read_message_created_at INTEGER, last_read_message_id TEXT)",
    );

    sqlite.run('CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT)');

    backend = {
      name: 'opencode',
      createSession: async () => `session-${++nextId}`,
      runMessage: async () => ({ type: 'error', output: '', sessionId: '' }),
      runChatCompletion: async () => ({
        outputs: [],
        model: '',
        tokens: null,
      }),
      availableModels: async () => [],
    };
  });

  afterEach(() => sqlite.close());

  test('isolates web and DM selections and refuses cross-workspace sessions', async () => {
    const web = await getOrCreateCurrentSession({
      db,
      backend,
      cwd: '/parent',
      workspace: 'parent',
      selection: 'web',
    });

    const dm = await getOrCreateCurrentSession({
      db,
      backend,
      cwd: '/parent',
      workspace: 'parent',
      selection: 'dm',
    });

    expect(web).not.toBe(dm);
    expect(getState(db, webSessionStateKey('parent'))).toBe(web);
    expect(getState(db, STATE_CURRENT_SESSION)).toBe(dm);
    expect(setCurrentSession(db, web, 'appweaver', 'web')).toBe(false);
    expect(() => assertWebSession(db, dm, 'appweaver')).toThrow();

    const other = await getOrCreateCurrentSession({
      db,
      backend,
      cwd: '/appweaver',
      workspace: 'appweaver',
      selection: 'web',
    });

    expect(other).not.toBe(web);
    expect(getState(db, webSessionStateKey('parent'))).toBe(web);
  });

  test('stores manual titles in AppWeaver and scopes them to the workspace', async () => {
    const id = await getOrCreateCurrentSession({
      db,
      backend,
      cwd: '/parent',
      workspace: 'parent',
      selection: 'web',
    });

    expect(
      renameAppWeaverSession({
        db,
        sessionId: id,
        workspace: 'parent',
        title: '  Research task  ',
        mode: 'manual',
      }),
    ).toEqual({ status: 'updated', title: 'Research task' });

    expect(listAppWeaverSessions(db, 'parent', 5)).toMatchObject([
      { id, title: 'Research task' },
    ]);

    expect(() =>
      renameAppWeaverSession({
        db,
        sessionId: id,
        workspace: 'appweaver',
        title: 'Other',
        mode: 'manual',
      }),
    ).toThrow();

    expect(() =>
      renameAppWeaverSession({
        db,
        sessionId: id,
        workspace: 'parent',
        title: ' ',
        mode: 'manual',
      }),
    ).toThrow();
  });
});
