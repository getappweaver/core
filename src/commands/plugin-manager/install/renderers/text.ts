import type { PluginsInstallRepresentation } from '../handler';

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
    const status = entry.installedAlias
      ? `installed as ${entry.installedAlias} @ ${entry.installedVersion}`
      : entry.compatibleRef
        ? `compatible: ${entry.compatibleRef.tag}`
        : `not compatible with core ${representation.coreVersion}`;

    lines.push(`- ${entry.title || entry.name} (${status})`);
    lines.push(`  author: ${entry.author.label}`);

    if (entry.title) {
      lines.push(`  d: ${entry.name}`);
    }

    if (entry.description) {
      lines.push(`  ${entry.description}`);
    }

    lines.push(`  repo: ${entry.repo}`);
  }

  lines.push(
    '',
    `Use ${options.prefix}plugins install <plugin-id-or-name> to install a compatible release.`,
  );

  return lines.join('\n');
}
