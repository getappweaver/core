function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitForRestartThenOpenApp(): Promise<void> {
  await sleep(800);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch('/api/health', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (res.ok) {
        window.location.assign('/');

        return;
      }
    } catch {
      // The server is expected to disappear briefly while restarting.
    }

    await sleep(500);
  }

  throw new Error('restart_poll_timeout');
}
