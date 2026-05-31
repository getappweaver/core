import { log } from '@src/logger';

export type CoreUpdateState =
  | 'checking'
  | 'available'
  | 'up_to_date'
  | 'unavailable';

export type CoreUpdateSnapshot = {
  state: CoreUpdateState;
  localRef: string | null;
  remoteRef: string | null;
  upstream: string | null;
  behind: number | null;
  ahead: number | null;
  checkedAtMs: number | null;
  message: string | null;
};

export type CoreUpdateChecker = {
  getSnapshot: () => CoreUpdateSnapshot;
  checkNow: () => Promise<CoreUpdateSnapshot>;
};

type RunGitProps = {
  root: string;
  args: string[];
  timeoutMs: number;
};

async function runGit({ root, args, timeoutMs }: RunGitProps): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      proc.kill();
      reject(new Error(`git ${args.join(' ')} timed out`));
    }, timeoutMs);
  });

  const exitCode = await Promise.race([proc.exited, timeout]).finally(() => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git ${args.join(' ')} failed`);
  }

  return stdout.trim();
}

function unavailableSnapshot(message: string): CoreUpdateSnapshot {
  return {
    state: 'unavailable',
    localRef: null,
    remoteRef: null,
    upstream: null,
    behind: null,
    ahead: null,
    checkedAtMs: Date.now(),
    message,
  };
}

export function createCoreUpdateChecker(root: string): CoreUpdateChecker {
  let snapshot: CoreUpdateSnapshot = {
    state: 'checking',
    localRef: null,
    remoteRef: null,
    upstream: null,
    behind: null,
    ahead: null,
    checkedAtMs: null,
    message: 'Update check has not finished yet.',
  };

  let inFlight: Promise<CoreUpdateSnapshot> | null = null;

  const checkNow = async (): Promise<CoreUpdateSnapshot> => {
    if (inFlight) {
      return inFlight;
    }

    snapshot = {
      ...snapshot,
      state: 'checking',
      message: 'Checking for updates…',
    };

    inFlight = (async () => {
      try {
        const upstream = await runGit({
          root,
          args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
          timeoutMs: 5_000,
        });

        await runGit({
          root,
          args: ['fetch', '--quiet', '--prune'],
          timeoutMs: 30_000,
        });

        const [localRef, remoteRef, counts] = await Promise.all([
          runGit({
            root,
            args: ['rev-parse', '--short', 'HEAD'],
            timeoutMs: 5_000,
          }),
          runGit({
            root,
            args: ['rev-parse', '--short', '@{u}'],
            timeoutMs: 5_000,
          }),
          runGit({
            root,
            args: ['rev-list', '--left-right', '--count', 'HEAD...@{u}'],
            timeoutMs: 5_000,
          }),
        ]);

        const [aheadRaw, behindRaw] = counts.split(/\s+/);
        const ahead = Number.parseInt(aheadRaw ?? '0', 10);
        const behind = Number.parseInt(behindRaw ?? '0', 10);
        const hasUpdate = behind > 0;

        snapshot = {
          state: hasUpdate ? 'available' : 'up_to_date',
          localRef,
          remoteRef,
          upstream,
          behind,
          ahead,
          checkedAtMs: Date.now(),
          message: hasUpdate
            ? `${behind} update${behind === 1 ? '' : 's'} available from ${upstream}.`
            : `Core is up to date with ${upstream}.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        snapshot = unavailableSnapshot(message);
        log.warn(`Core update check unavailable: ${message}`);
      } finally {
        inFlight = null;
      }

      return snapshot;
    })();

    return inFlight;
  };

  void checkNow();

  return {
    getSnapshot: () => snapshot,
    checkNow,
  };
}
