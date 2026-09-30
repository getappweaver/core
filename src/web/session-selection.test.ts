import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import type { CoreDb } from '@src/db';

import { getSelectedWebSessionId } from './session-selection';

describe('web session selection', () => {
  test('each tab can retain its own valid session despite a changed shared default', () => {
    const sqlite = new Database(':memory:');

    try {
      sqlite.run(
        'CREATE TABLE sessions (id TEXT PRIMARY KEY, backend TEXT, workspace TEXT)',
      );

      sqlite.run("INSERT INTO sessions VALUES ('a', 'opencode', 'parent')");
      sqlite.run("INSERT INTO sessions VALUES ('b', 'opencode', 'parent')");

      const db = sqlite as CoreDb;

      expect(getSelectedWebSessionId(db, 'a', 'parent')).toBe('a');
      expect(getSelectedWebSessionId(db, 'b', 'parent')).toBe('b');
      expect(getSelectedWebSessionId(db, 'b', 'appweaver')).toBeNull();
      expect(getSelectedWebSessionId(db, null, 'parent')).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
