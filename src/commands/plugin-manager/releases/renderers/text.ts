import type {
  PluginReleaseEntry,
  PluginReleaseStatus,
  PluginsReleasesRepresentation,
} from '../handler';

type RenderPluginsReleasesTextContext = {
  prefix: string;
};

function statusLabel(status: PluginReleaseStatus): string {
  switch (status) {
    case 'local-draft':
      return 'local draft';
    case 'not-published':
      return 'not published';
    case 'published-ok':
      return 'ok';
    case 'publish-needed':
      return 'publish needed';
    case 'metadata-publish-needed':
      return 'metadata publish needed';
    case 'commit-needed':
      return 'commit needed';
    case 'tag-needed':
      return 'tag needed';
    case 'push-needed':
      return 'push needed';
    case 'local-behind':
      return 'local behind';
    case 'version-unknown':
      return 'version unknown';
  }
}

function entryLine(entry: PluginReleaseEntry): string {
  const remotes = entry.git.remotes
    .map((remote) =>
      !remote.configured
        ? `${remote.name} missing`
        : remote.branchReady && remote.tagReady
          ? `${remote.name} ready`
          : `${remote.name} push needed`,
    )
    .join(', ');

  return [
    `${entry.installed.alias}:`,
    `local ${entry.localVersion ?? '(unknown)'}`,
    entry.published
      ? `published ${entry.published.version || '(unknown)'}`
      : 'not published',
    entry.authorSigner
      ? `author via ${entry.authorSigner.label}`
      : entry.publishSigners.length > 0
        ? `first-publish signer ${entry.publishSigners
            .map((signer) => signer.connectionName)
            .filter(Boolean)
            .join(', ')}`
        : 'no matching bunker signer',
    entry.git.changedFileCount === 0
      ? 'clean'
      : `${entry.git.stagedFileCount} staged, ${entry.git.unstagedFileCount} unstaged`,
    `branch ${entry.git.branch ?? '(detached)'}`,
    entry.git.localTagAtHead ? 'tag ready' : 'tag missing at HEAD',
    remotes,
    statusLabel(entry.status),
  ].join(' | ');
}

export function renderPluginsReleasesText(
  representation: PluginsReleasesRepresentation,
  context: RenderPluginsReleasesTextContext,
): string {
  const header = [
    'Plugin releases',
    `${representation.publishedCount}/${representation.installedCount} installed plugin(s) are published by ${representation.matchedSignerCount} matched author ${representation.matchedSignerCount === 1 ? 'identity' : 'identities'}.`,
    `${representation.unpublishedCount} plugin(s) are not published.`,
    `${representation.signerCount} available identities, including ${representation.bunkerSignerCount} bunker signer(s).`,
    `Relays: ${representation.relays.join(', ')}`,
  ].join('\n');

  if (representation.entries.length === 0) {
    return [
      header,
      '',
      'No local plugins can be managed with the available author signers.',
      `Add a bunker signer with ${context.prefix}bunker add, then try again.`,
    ].join('\n');
  }

  return [
    header,
    ...(representation.hiddenCount > 0
      ? [
          `Hidden plugin(s) published by unavailable authors: ${representation.hiddenCount}`,
        ]
      : []),
    '',
    ...representation.entries.map(entryLine),
  ].join('\n');
}
