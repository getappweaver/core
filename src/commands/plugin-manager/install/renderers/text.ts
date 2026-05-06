import type { PluginsInstallRepresentation } from '../handler';

export function renderPluginsInstallText(
  representation: PluginsInstallRepresentation,
  options: { prefix: string },
): string {
  if (representation.entries.length === 0) {
    return 'No plugins found on the queried relays.';
  }

  const lines = [
    `Found ${representation.entries.length} plugin(s) for bot core ${representation.coreMajor}:`,
    '',
  ];

  for (const entry of representation.entries) {
    const status = entry.installedAlias
      ? `installed as ${entry.installedAlias} @ ${entry.installedVersion}`
      : entry.compatibleRef
        ? `compatible: ${entry.compatibleRef.tag}`
        : `not compatible with core ${representation.coreMajor}`;

    lines.push(`- ${entry.name} (${status})`);

    if (entry.description) {
      lines.push(`  ${entry.description}`);
    }

    lines.push(`  repo: ${entry.repo}`);
  }

  lines.push('', `Use ${options.prefix}plugins install to refresh this list.`);

  return lines.join('\n');
}
