type SessionRun = {
  requestId: string;
  kind: 'chat' | 'compact';
  abort: AbortController;
};

const runs = new Map<string, SessionRun>();

export function isSessionRunning(sessionId: string): boolean {
  return runs.has(sessionId);
}

export function startSessionRun(
  sessionId: string,
  requestId: string,
  kind: SessionRun['kind'],
): AbortController {
  if (runs.has(sessionId)) {
    throw new Error(
      'This session is already running. Stop it before starting another operation.',
    );
  }

  const abort = new AbortController();
  runs.set(sessionId, { requestId, kind, abort });

  return abort;
}

export function stopSessionRun(sessionId: string): boolean {
  const run = runs.get(sessionId);

  if (!run) {
    return false;
  }

  run.abort.abort();

  return true;
}

export function finishSessionRun(sessionId: string, requestId: string): void {
  if (runs.get(sessionId)?.requestId === requestId) {
    runs.delete(sessionId);
  }
}
