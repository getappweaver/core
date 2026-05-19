import type { Filter, NostrEvent } from 'nostr-tools';

import { debug } from '@src/logger';

export type QueryNostrWithNodeProps = {
  relays: string[];
  filter: Filter;
  maxWait: number;
  debugLabel: string;
};

type NodeNostrQueryOutput =
  | {
      ok: true;
      durationMs: number;
      events: NostrEvent[];
    }
  | {
      ok: false;
      error: string;
    };

function nodeQueryScriptPath(): string {
  return new URL('./node-query.mjs', import.meta.url).pathname;
}

export async function queryNostrWithNode({
  relays,
  filter,
  maxWait,
  debugLabel,
}: QueryNostrWithNodeProps): Promise<NostrEvent[]> {
  const startedAt = Date.now();

  const proc = Bun.spawn(['node', nodeQueryScriptPath()], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  proc.stdin.write(JSON.stringify({ relays, filter, maxWait }));
  proc.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (stderr.trim().length > 0) {
    debug('nostr node query stderr', {
      label: debugLabel,
      stderr: stderr.trim(),
    });
  }

  let output: NodeNostrQueryOutput;

  try {
    output = JSON.parse(stdout) as NodeNostrQueryOutput;
  } catch (err) {
    debug('nostr node query invalid JSON', {
      label: debugLabel,
      exitCode,
      stdout,
      error: err instanceof Error ? err.message : String(err),
    });

    return [];
  }

  if (!output.ok) {
    debug('nostr node query failed', {
      label: debugLabel,
      exitCode,
      error: output.error,
      durationMs: Date.now() - startedAt,
    });

    return [];
  }

  debug('nostr node query complete', {
    label: debugLabel,
    exitCode,
    nodeDurationMs: output.durationMs,
    totalDurationMs: Date.now() - startedAt,
    eventCount: output.events.length,
    sampleEventIds: output.events.slice(0, 5).map((event) => event.id),
  });

  return output.events;
}
