import type { RouteCommandContext } from '../../dispatch';

function checkedAtLabel(checkedAtMs: number | null): string {
  if (checkedAtMs === null) {
    return 'not checked yet';
  }

  return new Date(checkedAtMs).toLocaleString();
}

export async function handleBotUpdateCheck(
  ctx: RouteCommandContext,
): Promise<string> {
  if (!ctx.coreUpdateChecker) {
    return 'Core update check is unavailable.';
  }

  const update = await ctx.coreUpdateChecker.checkNow();

  const stateLabel =
    update.state === 'available'
      ? 'update available'
      : update.state === 'up_to_date'
        ? 'up to date'
        : update.state;

  const lines = [
    `Core update: ${stateLabel}`,
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

  return lines.join('\n');
}
