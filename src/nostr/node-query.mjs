import { SimplePool } from 'nostr-tools/pool';

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

try {
  const input = JSON.parse(await readStdin());
  const pool = new SimplePool();
  const startedAt = Date.now();
  const events = await pool.querySync(input.relays, input.filter, {
    maxWait: input.maxWait,
  });

  pool.close(input.relays);

  process.stdout.write(
    JSON.stringify({
      ok: true,
      durationMs: Date.now() - startedAt,
      events,
    }),
  );
} catch (err) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  process.exitCode = 1;
}
