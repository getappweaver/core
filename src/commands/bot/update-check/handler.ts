import type { CoreUpdateSnapshot } from '@src/core/update-check';
import type { WebHandlerResult } from '@src/web/ui-schema';

import type { RouteCommandContext } from '../../dispatch';

import { renderBotUpdateCheckWeb } from './renderers/web';

function checkedAtLabel(checkedAtMs: number | null): string {
  if (checkedAtMs === null) {
    return 'not checked yet';
  }

  return new Date(checkedAtMs).toLocaleString();
}

export async function handleBotUpdateCheck(
  ctx: RouteCommandContext,
): Promise<WebHandlerResult> {
  if (!ctx.coreUpdateChecker) {
    return 'Core update check is unavailable.';
  }

  const update = await ctx.coreUpdateChecker.checkNow();

  if (ctx.source === 'web') {
    return renderBotUpdateCheckWeb(update);
  }

  return renderBotUpdateCheckText(update);
}

function renderBotUpdateCheckText(update: CoreUpdateSnapshot): string {
  const stateLabel =
    update.state === 'available'
      ? 'update available'
      : update.state === 'up_to_date'
        ? 'up to date'
        : update.state;

  const lines = [
    `Core update: ${stateLabel}`,
    `Version: ${update.localVersion ?? 'unknown'} → ${update.remoteVersion ?? 'unknown'} (${update.updateLevel})`,
    `Checked: ${checkedAtLabel(update.checkedAtMs)}`,
  ];

  if (update.message) {
    lines.push(update.message);
  }

  if (update.localRef) {
    lines.push(`Local: ${update.localRef}`);
  }

  if (update.remoteRef) {
    lines.push(`Remote: ${update.remoteRef}`);
  }

  if (update.upstream) {
    lines.push(`Upstream: ${update.upstream}`);
  }

  if (update.changelog.length > 0) {
    lines.push('Changelog:');

    for (const entry of update.changelog) {
      lines.push(`- ${entry.ref} ${entry.subject}`);
    }

    if (update.changelogTruncated) {
      lines.push('- …');
    }
  }

  return lines.join('\n');
}
