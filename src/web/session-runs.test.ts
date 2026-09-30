import { describe, expect, test } from 'bun:test';

import {
  finishSessionRun,
  isSessionRunning,
  startSessionRun,
  stopSessionRun,
} from './session-runs';

describe('session runs', () => {
  test('runs separate sessions independently and stops only the target', () => {
    const first = startSessionRun('first', 'request-a', 'chat');
    const second = startSessionRun('second', 'request-b', 'chat');

    try {
      expect(isSessionRunning('first')).toBe(true);
      expect(isSessionRunning('second')).toBe(true);

      expect(() => startSessionRun('first', 'request-c', 'compact')).toThrow(
        'already running',
      );

      expect(stopSessionRun('first')).toBe(true);
      expect(first.signal.aborted).toBe(true);
      expect(second.signal.aborted).toBe(false);
      expect(isSessionRunning('second')).toBe(true);

      finishSessionRun('first', 'request-c');

      expect(isSessionRunning('first')).toBe(true);
    } finally {
      finishSessionRun('first', 'request-a');
      finishSessionRun('second', 'request-b');
    }

    expect(isSessionRunning('first')).toBe(false);
    expect(isSessionRunning('second')).toBe(false);
  });
});
