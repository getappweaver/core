import type { PluginsPublishRepresentation } from '../handler';

export function renderPluginsPublishText(
  representation: PluginsPublishRepresentation,
): string {
  const lines = [
    `Plugin publish: ${representation.alias}`,
    representation.message,
  ];

  if (representation.eventId) {
    lines.push(`Event ID: ${representation.eventId}`);
  }

  if (representation.relays.length > 0) {
    lines.push('', 'Relays:');

    for (const relay of representation.relays) {
      lines.push(
        relay.ok ? `  ✓ ${relay.relay}` : `  ✗ ${relay.relay}: ${relay.error}`,
      );
    }
  }

  return lines.join('\n');
}
