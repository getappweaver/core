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
    case 'published-ok':
      return 'ok';
    case 'publish-needed':
      return 'publish needed';
    case 'local-behind':
      return 'local behind';
    case 'version-unknown':
      return 'version unknown';
  }
}

function entryLine(entry: PluginReleaseEntry): string {
  return [
    `${entry.installed.alias}:`,
    `local ${entry.localVersion ?? '(unknown)'}`,
    `published ${entry.published.version || '(unknown)'}`,
    `author via ${entry.authorSigner.label}`,
    statusLabel(entry.status),
  ].join(' | ');
}

export function renderPluginsReleasesText(
  representation: PluginsReleasesRepresentation,
  context: RenderPluginsReleasesTextContext,
): string {
  const hidden = representation.installedCount - representation.matchedCount;

  const header = [
    'Plugin releases',
    `Matched ${representation.matchedCount}/${representation.installedCount} installed plugin(s) using ${representation.signerCount} signer(s).`,
    `Relays: ${representation.relays.join(', ')}`,
  ].join('\n');

  if (representation.entries.length === 0) {
    return [
      header,
      '',
      'No installed plugins matched the available author signers.',
      `Add a bunker signer with ${context.prefix}bunker add, then try again.`,
    ].join('\n');
  }

  return [
    header,
    ...(hidden > 0 ? [`Hidden non-authored/unknown plugin(s): ${hidden}`] : []),
    '',
    ...representation.entries.map(entryLine),
  ].join('\n');
}
