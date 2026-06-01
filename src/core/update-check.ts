import { log } from '@src/logger';

export type CoreUpdateState =
  | 'checking'
  | 'available'
  | 'up_to_date'
  | 'unavailable';

export type CoreUpdateLevel = 'major' | 'minor' | 'patch' | 'same' | 'unknown';

export type CoreUpdateChangelogEntry = {
  ref: string;
  subject: string;
};

export type CoreUpdateSnapshot = {
  state: CoreUpdateState;
  localVersion: string | null;
  remoteVersion: string | null;
  updateLevel: CoreUpdateLevel;
  changelog: CoreUpdateChangelogEntry[];
  changelogTruncated: boolean;
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
  updateNow: () => Promise<CoreUpdateApplyResult>;
};

export type CoreUpdateApplyResult = {
  beforeRef: string | null;
  afterRef: string | null;
  upstream: string | null;
  pulled: boolean;
  pullOutput: string;
  snapshot: CoreUpdateSnapshot;
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
    localVersion: null,
    remoteVersion: null,
    updateLevel: 'unknown',
    changelog: [],
    changelogTruncated: false,
    localRef: null,
    remoteRef: null,
    upstream: null,
    behind: null,
    ahead: null,
    checkedAtMs: Date.now(),
    message,
  };
}

function parseChangelog(raw: string): CoreUpdateChangelogEntry[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref, ...subjectParts] = line.split('\t');
      const subject = subjectParts.join('\t').trim();

      return {
        ref: ref.trim(),
        subject: subject || ref.trim(),
      };
    });
}

function versionFromPackageJson(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { version?: unknown };

    return typeof parsed.version === 'string' && parsed.version.trim()
      ? parsed.version.trim()
      : null;
  } catch {
    return null;
  }
}

function versionParts(value: string | null): [number, number, number] | null {
  const match = value?.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
  ];
}

function updateLevelForVersions({
  localVersion,
  remoteVersion,
}: {
  localVersion: string | null;
  remoteVersion: string | null;
}): CoreUpdateLevel {
  const local = versionParts(localVersion);
  const remote = versionParts(remoteVersion);

  if (!local || !remote) {
    return 'unknown';
  }

  if (remote[0] !== local[0]) {
    return 'major';
  }

  if (remote[1] !== local[1]) {
    return 'minor';
  }

  if (remote[2] !== local[2]) {
    return 'patch';
  }

  return 'same';
}

export function createCoreUpdateChecker(root: string): CoreUpdateChecker {
  let snapshot: CoreUpdateSnapshot = {
    state: 'checking',
    localVersion: null,
    remoteVersion: null,
    updateLevel: 'unknown',
    changelog: [],
    changelogTruncated: false,
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

        const [localRef, remoteRef, counts, localPkg, remotePkg, changelogRaw] =
          await Promise.all([
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
            runGit({
              root,
              args: ['show', 'HEAD:package.json'],
              timeoutMs: 5_000,
            }),
            runGit({
              root,
              args: ['show', '@{u}:package.json'],
              timeoutMs: 5_000,
            }),
            runGit({
              root,
              args: [
                'log',
                '--max-count=21',
                '--pretty=format:%h%x09%s',
                'HEAD..@{u}',
              ],
              timeoutMs: 5_000,
            }),
          ]);

        const [aheadRaw, behindRaw] = counts.split(/\s+/);
        const ahead = Number.parseInt(aheadRaw ?? '0', 10);
        const behind = Number.parseInt(behindRaw ?? '0', 10);
        const hasUpdate = behind > 0;
        const localVersion = versionFromPackageJson(localPkg);
        const remoteVersion = versionFromPackageJson(remotePkg);

        const updateLevel = updateLevelForVersions({
          localVersion,
          remoteVersion,
        });

        const changelogEntries = parseChangelog(changelogRaw);
        const changelogTruncated = changelogEntries.length > 20;

        snapshot = {
          state: hasUpdate ? 'available' : 'up_to_date',
          localVersion,
          remoteVersion,
          updateLevel,
          changelog: changelogEntries.slice(0, 20),
          changelogTruncated,
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

  const updateNow = async (): Promise<CoreUpdateApplyResult> => {
    const before = await checkNow();

    const pullOutput = await runGit({
      root,
      args: ['pull', '--ff-only'],
      timeoutMs: 60_000,
    });

    const after = await checkNow();

    const pulled =
      before.localRef !== null &&
      after.localRef !== null &&
      before.localRef !== after.localRef;

    return {
      beforeRef: before.localRef,
      afterRef: after.localRef,
      upstream: after.upstream ?? before.upstream,
      pulled,
      pullOutput,
      snapshot: after,
    };
  };

  void checkNow();

  return {
    getSnapshot: () => snapshot,
    checkNow,
    updateNow,
  };
}
