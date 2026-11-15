import {
  parseNostrRepoAddress,
  repoAddressAuthorNpub,
} from '@src/nostr/repo-address';

export type PublishRepositoryChoice = { name: string; repo: string };

export function repositoryKey(repo: string): string {
  const address = parseNostrRepoAddress(repo);

  if (address) {
    return `nostr:${repoAddressAuthorNpub(address.authorHint) ?? address.authorHint.toLowerCase()}/${address.repoId}`;
  }

  try {
    const url = new URL(repo.trim());
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');

    return url.toString();
  } catch {
    return repo
      .trim()
      .replace(/\/+$/, '')
      .replace(/\.git$/, '');
  }
}

export function sameRepository(left: string, right: string): boolean {
  return repositoryKey(left) === repositoryKey(right);
}

export function gitRepositoryChoices(
  pluginDir: string,
): PublishRepositoryChoice[] {
  const remotes = Bun.spawnSync(['git', 'remote'], {
    cwd: pluginDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (remotes.exitCode !== 0) {
    throw new Error('Cannot read plugin Git remotes.');
  }

  return remotes.stdout
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)
    .flatMap((name) => {
      const urls = Bun.spawnSync(['git', 'remote', 'get-url', '--all', name], {
        cwd: pluginDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      if (urls.exitCode !== 0) {
        throw new Error(`Cannot read Git remote ${name}.`);
      }

      return urls.stdout
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((repo) => ({ name, repo }));
    });
}

type RepositorySelectionProps = {
  choices: PublishRepositoryChoice[];
  installedRepo: string;
  publishedRepo: string | null;
  fallbackRepo: string;
  requestedRepo: string | null;
};

export function selectPublicationRepository({
  choices,
  installedRepo,
  publishedRepo,
  fallbackRepo,
  requestedRepo,
}: RepositorySelectionProps): { repo: string; needsSelection: boolean } {
  const candidates = [
    ...choices.map((choice) => choice.repo),
    installedRepo,
    publishedRepo,
    fallbackRepo,
  ].filter(
    (repo): repo is string => Boolean(repo) && !repo?.startsWith('local://'),
  );

  const preferred =
    candidates.find((repo) => sameRepository(repo, installedRepo)) ??
    choices.find((choice) => choice.name === 'origin')?.repo ??
    publishedRepo ??
    candidates[0];

  if (!preferred) {
    throw new Error('No publication repository is available.');
  }

  if (requestedRepo && !candidates.some((repo) => repo === requestedRepo)) {
    throw new Error(
      'Selected repository is no longer available. Reopen publication review.',
    );
  }

  const installedInChoices =
    !installedRepo.startsWith('local://') &&
    choices.some((choice) => sameRepository(choice.repo, installedRepo));

  if (
    requestedRepo === null &&
    installedInChoices &&
    (publishedRepo === null || sameRepository(publishedRepo, installedRepo))
  ) {
    return {
      repo: installedRepo,
      needsSelection: false,
    };
  }

  const repo = requestedRepo ?? preferred;

  const mismatch =
    (!installedRepo.startsWith('local://') &&
      !sameRepository(installedRepo, repo)) ||
    (publishedRepo !== null && !sameRepository(publishedRepo, repo)) ||
    choices.some((choice) => !sameRepository(choice.repo, repo));

  return {
    repo,
    needsSelection: requestedRepo === null && (choices.length > 1 || mismatch),
  };
}

export function collectPublishRemotes({
  choices,
  primaryRepo,
}: {
  choices: PublishRepositoryChoice[];
  primaryRepo: string;
}): string[] {
  const seen = new Set<string>([repositoryKey(primaryRepo)]);
  const remotes = [primaryRepo];

  for (const choice of choices) {
    if (choice.repo.startsWith('local://')) {
      continue;
    }

    const key = repositoryKey(choice.repo);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    remotes.push(choice.repo);
  }

  return remotes;
}
