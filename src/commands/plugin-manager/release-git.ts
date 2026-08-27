import { join } from 'path';

import { monitoring } from '@src/core/monitoring';

const RELEASE_REMOTES = ['origin', 'github'] as const;

type ReleaseRemoteName = (typeof RELEASE_REMOTES)[number];

const REQUIRED_RELEASE_REMOTES = new Set<ReleaseRemoteName>(['origin']);

const REMOTE_CACHE_TTL_MS = 30_000;

const remoteCache = new Map<
  string,
  { expiresAt: number; remotes: PluginReleaseRemoteState[] }
>();

function remoteCacheKey({
  pluginDir,
  branch,
  versionTag,
  head,
}: {
  pluginDir: string;
  branch: string | null;
  versionTag: string;
  head: string;
}): string {
  return `${pluginDir}:${branch ?? ''}:${versionTag}:${head}`;
}

export function clearPluginReleaseRemoteCache(): void {
  remoteCache.clear();
}

export type PluginReleaseRemoteState = {
  name: ReleaseRemoteName;
  required: boolean;
  configured: boolean;
  branchReady: boolean;
  tagReady: boolean;
  error: string | null;
};

export type PluginReleaseGitState = {
  branch: string | null;
  changedFileCount: number;
  stagedFileCount: number;
  unstagedFileCount: number;
  localTagAtHead: boolean;
  remotes: PluginReleaseRemoteState[];
};

type RunGitResult = { ok: true; stdout: string } | { ok: false; error: string };

function runGit(pluginDir: string, args: string[]): RunGitResult {
  const result = Bun.spawnSync(['git', ...args], {
    cwd: pluginDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();

  return result.exitCode === 0
    ? { ok: true, stdout }
    : { ok: false, error: stderr || stdout || 'Git command failed.' };
}

async function runGitAsync(
  pluginDir: string,
  args: string[],
): Promise<RunGitResult> {
  const proc = Bun.spawn(['git', ...args], {
    cwd: pluginDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const stdout = stdoutBuf.trim();
  const stderr = stderrBuf.trim();

  return exitCode === 0
    ? { ok: true, stdout }
    : { ok: false, error: stderr || stdout || 'Git command failed.' };
}

// Kept for synchronous callers (e.g. tests) — not used in hot path
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function requiredGitOutput(pluginDir: string, args: string[]): string {
  const result = runGit(pluginDir, args);

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.stdout;
}

async function remoteState({
  pluginDir,
  name,
  branch,
  versionTag,
  head,
}: {
  pluginDir: string;
  name: ReleaseRemoteName;
  branch: string | null;
  versionTag: string;
  head: string;
}): Promise<PluginReleaseRemoteState> {
  const configured = runGit(pluginDir, ['remote', 'get-url', name]).ok;
  const required = REQUIRED_RELEASE_REMOTES.has(name);

  if (!configured || branch === null) {
    return {
      name,
      required,
      configured,
      branchReady: false,
      tagReady: false,
      error: branch === null ? 'Detached HEAD' : null,
    };
  }

  const branchRef = `refs/heads/${branch}`;
  const tagRef = `refs/tags/${versionTag}`;

  const span = monitoring.startSpan({
    name: 'plugins.releases.git.ls-remote',
    attributes: { remote: name, branch: branch ?? '', versionTag },
    parent: null,
  });

  const refs = await runGitAsync(pluginDir, [
    'ls-remote',
    name,
    branchRef,
    tagRef,
    `${tagRef}^{}`,
  ]);

  span.end(refs.ok ? 'ok' : 'error');

  if (!refs.ok) {
    return {
      name,
      required,
      configured: true,
      branchReady: false,
      tagReady: false,
      error: refs.error,
    };
  }

  const hashes = new Map(
    refs.stdout
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [hash = '', ref = ''] = line.trim().split(/\s+/, 2);

        return [ref, hash] as const;
      }),
  );

  return {
    name,
    required,
    configured: true,
    branchReady: hashes.get(branchRef) === head,
    tagReady:
      hashes.get(tagRef) === head || hashes.get(`${tagRef}^{}`) === head,
    error: null,
  };
}

export async function inspectPluginReleaseGit({
  dmBotRoot,
  alias,
  versionTag,
}: {
  dmBotRoot: string;
  alias: string;
  versionTag: string;
}): Promise<PluginReleaseGitState> {
  const span = monitoring.startSpan({
    name: 'plugins.releases.git.inspect',
    attributes: { alias, versionTag },
    parent: null,
  });

  const pluginDir = join(dmBotRoot, 'plugins', alias);

  const localSpan = monitoring.startSpan({
    name: 'plugins.releases.git.local',
    attributes: { alias },
    parent: null,
  });

  const [status, staged, unstaged, untracked, branchResult, head, tagCommit] =
    await Promise.all([
      runGitAsync(pluginDir, ['status', '--porcelain=v1', '-z']),
      runGitAsync(pluginDir, ['diff', '--cached', '--name-only', '-z']),
      runGitAsync(pluginDir, ['diff', '--name-only', '-z']),
      runGitAsync(pluginDir, [
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
      ]),
      runGitAsync(pluginDir, ['symbolic-ref', '--short', 'HEAD']),
      runGitAsync(pluginDir, ['rev-parse', 'HEAD']),
      runGitAsync(pluginDir, ['rev-list', '-n', '1', versionTag]),
    ]);

  const statusStr = status.ok ? status.stdout : '';
  const stagedStr = staged.ok ? staged.stdout : '';
  const unstagedStr = unstaged.ok ? unstaged.stdout : '';
  const untrackedStr = untracked.ok ? untracked.stdout : '';

  const branch =
    branchResult.ok && branchResult.stdout ? branchResult.stdout : null;

  const headStr = head.ok ? head.stdout : '';
  const localTagAtHead = tagCommit.ok && tagCommit.stdout === headStr;

  if (!status.ok) {
    throw new Error(status.error);
  }

  if (!head.ok) {
    throw new Error(head.error);
  }

  const statusEntries = statusStr
    .split('\0')
    .filter((entry) => entry.length > 0);

  localSpan.end();

  const cacheKey = remoteCacheKey({
    pluginDir,
    branch,
    versionTag,
    head: headStr,
  });

  const cached = remoteCache.get(cacheKey);

  const remotes =
    cached && cached.expiresAt > Date.now()
      ? cached.remotes
      : await Promise.all(
          RELEASE_REMOTES.map((name) =>
            remoteState({
              pluginDir,
              name,
              branch,
              versionTag,
              head: headStr,
            }),
          ),
        );

  if (!cached || cached.expiresAt <= Date.now()) {
    remoteCache.set(cacheKey, {
      expiresAt: Date.now() + REMOTE_CACHE_TTL_MS,
      remotes,
    });
  }

  span.end();

  return {
    branch,
    changedFileCount: statusEntries.length,
    stagedFileCount: stagedStr.split('\0').filter((entry) => entry.length > 0)
      .length,
    unstagedFileCount:
      unstagedStr.split('\0').filter((entry) => entry.length > 0).length +
      untrackedStr.split('\0').filter((entry) => entry.length > 0).length,
    localTagAtHead,
    remotes,
  };
}

export async function pushPluginRelease({
  dmBotRoot,
  alias,
  versionTag,
}: {
  dmBotRoot: string;
  alias: string;
  versionTag: string;
}): Promise<void> {
  const pluginDir = join(dmBotRoot, 'plugins', alias);
  const state = await inspectPluginReleaseGit({ dmBotRoot, alias, versionTag });

  if (state.changedFileCount > 0) {
    throw new Error(
      `Plugin has ${state.changedFileCount} uncommitted file change(s). Commit them before publishing.`,
    );
  }

  if (state.branch === null) {
    throw new Error('Cannot publish a release from a detached HEAD.');
  }

  if (!state.localTagAtHead) {
    throw new Error(`${versionTag} does not point at the current commit.`);
  }

  for (const remote of state.remotes) {
    if (!remote.configured) {
      if (remote.required) {
        throw new Error(
          `Required git remote is not configured: ${remote.name}`,
        );
      }

      continue;
    }

    const pushed = runGit(pluginDir, [
      'push',
      remote.name,
      state.branch,
      '--tags',
    ]);

    if (!pushed.ok) {
      throw new Error(`Failed to push ${remote.name}: ${pushed.error}`);
    }
  }

  clearPluginReleaseRemoteCache();

  const verified = await inspectPluginReleaseGit({
    dmBotRoot,
    alias,
    versionTag,
  });

  const incomplete = verified.remotes.filter(
    (remote) => remote.configured && (!remote.branchReady || !remote.tagReady),
  );

  if (incomplete.length > 0) {
    throw new Error(
      `Remote verification failed: ${incomplete.map((remote) => remote.name).join(', ')}`,
    );
  }
}
