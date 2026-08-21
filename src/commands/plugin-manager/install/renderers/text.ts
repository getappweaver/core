import type { PluginsInstallRepresentation } from '../handler';

function changelogLabel(installedAlias: string | null): string {
  return installedAlias ? 'changes' : 'release notes';
}

function indentedChangelog(changelog: string): string[] {
  return changelog.split('\n').map((line) => `      ${line}`);
}

export function renderPluginsInstallText(
  representation: PluginsInstallRepresentation,
  options: { prefix: string },
): string {
  if (representation.entries.length === 0) {
    return 'No plugins found on the queried relays.';
  }

  const lines = [
    `Found ${representation.entries.length} plugin(s) for bot core ${representation.coreVersion}:`,
    '',
  ];

  for (const entry of representation.entries) {
    const coreMajor =
      representation.coreVersion.split('.')[0] || representation.coreVersion;

    const verification = entry.coreCompatibilityVerified
      ? ''
      : `; unverified on core ${coreMajor}`;

    const status = entry.installedAlias
      ? entry.updateAvailable || entry.blockedUpdateRef
        ? `installed as ${entry.installedAlias} @ ${entry.installedVersion ?? 'unknown'}; update(s) available${verification}`
        : `installed as ${entry.installedAlias} @ ${entry.installedVersion ?? 'unknown'}; up to date${verification}`
      : entry.compatibleRef
        ? entry.coreCompatibilityVerified
          ? `compatible: ${entry.compatibleRef.tag}`
          : `unverified on core ${coreMajor}: ${entry.compatibleRef.tag}`
        : `not compatible with core ${representation.coreVersion}`;

    lines.push(`- ${entry.title || entry.name} (${status})`);
    lines.push(`  author: ${entry.author.label}`);

    if (entry.title) {
      lines.push(`  d: ${entry.name}`);
    }

    if (entry.description) {
      lines.push(`  ${entry.description}`);
    }

    if (entry.updateAvailable && entry.compatibleRef) {
      lines.push(`  install: ${entry.compatibleRef.tag}`);
    }

    if (entry.blockedUpdateRef) {
      lines.push(
        entry.coreUpdateCanUnlockBlockedRef
          ? `  update core to unlock: ${entry.blockedUpdateRef.tag}`
          : `  ${entry.blockedUpdateRef.tag} requires core ${entry.blockedUpdateRef.coreApiVersion}`,
      );
    }

    if (entry.changelogRefs.length > 0) {
      lines.push(`  ${changelogLabel(entry.installedAlias)}:`);

      for (const ref of entry.changelogRefs) {
        lines.push(`    ${ref.tag}:`);
        lines.push(...indentedChangelog(ref.changelog));
      }
    }

    lines.push(`  repo: ${entry.repo}`);
  }

  lines.push(
    '',
    `Use ${options.prefix}plugins install <plugin-id-or-name> to install or update a compatible release.`,
  );

  return lines.join('\n');
}
