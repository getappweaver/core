import { join } from 'path';

const RELEASE_REMOTES = ['origin', 'github'] as const;

type ReleaseRemoteName = (typeof RELEASE_REMOTES)[number];

export type PluginReleaseRemoteState = {
  name: ReleaseRemoteName;
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

function requiredGitOutput(pluginDir: string, args: string[]): string {
  const result = runGit(pluginDir, args);

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.stdout;
}

function remoteState({
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
}): PluginReleaseRemoteState {
  const configured = runGit(pluginDir, ['remote', 'get-url', name]).ok;

  if (!configured || branch === null) {
    return {
      name,
      configured,
      branchReady: false,
      tagReady: false,
      error: branch === null ? 'Detached HEAD' : null,
    };
  }

  const branchRef = `refs/heads/${branch}`;
  const tagRef = `refs/tags/${versionTag}`;

  const refs = runGit(pluginDir, [
    'ls-remote',
    name,
    branchRef,
    tagRef,
    `${tagRef}^{}`,
  ]);

  if (!refs.ok) {
    return {
      name,
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
    configured: true,
    branchReady: hashes.get(branchRef) === head,
    tagReady:
      hashes.get(tagRef) === head || hashes.get(`${tagRef}^{}`) === head,
    error: null,
  };
}

export function inspectPluginReleaseGit({
  dmBotRoot,
  alias,
  versionTag,
}: {
  dmBotRoot: string;
  alias: string;
  versionTag: string;
}): PluginReleaseGitState {
  const pluginDir = join(dmBotRoot, 'plugins', alias);

  const status = requiredGitOutput(pluginDir, [
    'status',
    '--porcelain=v1',
    '-z',
  ]);

  const statusEntries = status.split('\0').filter((entry) => entry.length > 0);

  const staged = requiredGitOutput(pluginDir, [
    'diff',
    '--cached',
    '--name-only',
    '-z',
  ]);

  const unstaged = requiredGitOutput(pluginDir, ['diff', '--name-only', '-z']);

  const untracked = requiredGitOutput(pluginDir, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ]);

  const branchResult = runGit(pluginDir, ['symbolic-ref', '--short', 'HEAD']);

  const branch =
    branchResult.ok && branchResult.stdout ? branchResult.stdout : null;

  const head = requiredGitOutput(pluginDir, ['rev-parse', 'HEAD']);
  const tagCommit = runGit(pluginDir, ['rev-list', '-n', '1', versionTag]);

  return {
    branch,
    changedFileCount: statusEntries.length,
    stagedFileCount: staged.split('\0').filter((entry) => entry.length > 0)
      .length,
    unstagedFileCount:
      unstaged.split('\0').filter((entry) => entry.length > 0).length +
      untracked.split('\0').filter((entry) => entry.length > 0).length,
    localTagAtHead: tagCommit.ok && tagCommit.stdout === head,
    remotes: RELEASE_REMOTES.map((name) =>
      remoteState({ pluginDir, name, branch, versionTag, head }),
    ),
  };
}

export function pushPluginRelease({
  dmBotRoot,
  alias,
  versionTag,
}: {
  dmBotRoot: string;
  alias: string;
  versionTag: string;
}): void {
  const pluginDir = join(dmBotRoot, 'plugins', alias);
  const state = inspectPluginReleaseGit({ dmBotRoot, alias, versionTag });

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
      throw new Error(`Required git remote is not configured: ${remote.name}`);
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

  const verified = inspectPluginReleaseGit({ dmBotRoot, alias, versionTag });

  const incomplete = verified.remotes.filter(
    (remote) => !remote.branchReady || !remote.tagReady,
  );

  if (incomplete.length > 0) {
    throw new Error(
      `Remote verification failed: ${incomplete.map((remote) => remote.name).join(', ')}`,
    );
  }
}
