import { loadRoadmapSnapshots } from '@src/roadmap';

import type { BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import {
  materializeRoadmap,
  ROADMAP_RELAY_DISCOVERY_RELAYS,
  uniqueRoadmapRelays,
  type IssueView,
  type RoadmapView,
} from './model';
import { renderRoadmapFundWeb, renderRoadmapWeb } from './renderers/web';
import {
  defaultRoadmapRepoAddresses,
  resolveRoadmapRepoTargets,
} from './targets';

function relayArgs(args: string[]): string[] {
  const fallbackRelays = [...ROADMAP_RELAY_DISCOVERY_RELAYS];
  const relayIndex = args.findIndex((arg) => arg === '--relay');

  if (relayIndex >= 0) {
    const relays = uniqueRoadmapRelays((args[relayIndex + 1] ?? '').split(','));

    return relays.length > 0 ? relays : fallbackRelays;
  }

  return fallbackRelays;
}

function optionArg(args: string[], flag: string): string {
  const index = args.findIndex((arg) => arg === flag);

  if (index < 0) {
    return '';
  }

  return args[index + 1] ?? '';
}

function positionalArg(args: string[], index: number): string {
  return (
    args.filter((arg, idx) => {
      if (arg === '--relay') {
        return false;
      }

      if (arg === '--title' || arg === '--sats') {
        return false;
      }

      if (
        idx > 0 &&
        (args[idx - 1] === '--relay' ||
          args[idx - 1] === '--title' ||
          args[idx - 1] === '--sats')
      ) {
        return false;
      }

      return true;
    })[index] ?? ''
  );
}

function formatSats(value: number): string {
  return `${value.toLocaleString('en-US')} sats`;
}

function roadmapZapReceiptPubkeys(): Set<string> | null {
  const raw = process.env.APPWEAVER_ROADMAP_ZAP_RECEIPT_PUBKEYS?.trim();

  if (!raw) {
    return null;
  }

  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function renderIssue(issue: IssueView): string {
  const status = issue.status ? ` · ${issue.status}` : '';
  const labels = issue.labels.length > 0 ? ` · ${issue.labels.join(', ')}` : '';

  return `- ${issue.subject} (${formatSats(issue.fundingSats)}, ${issue.zapCount} zap${issue.zapCount === 1 ? '' : 's'}, ${issue.commentCount} comment${issue.commentCount === 1 ? '' : 's'}${status}${labels})`;
}

function renderRoadmap(view: RoadmapView): string {
  const lines = [
    `Roadmap (${view.relays.length > 0 ? view.relays.join(', ') : view.relay})`,
    `${view.issueCount} issues · ${view.zapCount} verified zap events`,
  ];

  for (const workflow of view.workflows) {
    lines.push('', workflow.title);

    for (const column of workflow.columns) {
      lines.push(`${column.label}`);

      if (column.issues.length === 0) {
        lines.push('- none');
      } else {
        lines.push(...column.issues.map(renderIssue));
      }
    }
  }

  return lines.join('\n');
}

async function loadRoadmap(ctx: Parameters<BuiltinHandler>[0]) {
  const relays = relayArgs(ctx.args.slice(1));

  const explicitRepoAddress = ctx.args.find((arg) =>
    arg.startsWith('nostr://'),
  );

  const repoAddresses = explicitRepoAddress
    ? [explicitRepoAddress]
    : defaultRoadmapRepoAddresses(ctx.dmBotRoot);

  const repoTargets = await resolveRoadmapRepoTargets({
    pool: ctx.pool,
    raws: repoAddresses,
    fallbackRelays: relays,
  });

  const snapshot = await loadRoadmapSnapshots({
    targets: repoTargets,
    boardKey: null,
    pool: ctx.pool,
  });

  const queriedRelays = uniqueRoadmapRelays([
    ...relays,
    ...repoTargets.flatMap((target) => target.relayHints),
    ...snapshot.relays,
  ]);

  const view = materializeRoadmap({
    relay: snapshot.relays[0] ?? relays[0] ?? '',
    events: snapshot.events,
    authorIdentities: null,
    zapReceiptPubkeys: roadmapZapReceiptPubkeys(),
    zapReceiptPubkeysByProjectAddress: null,
  });

  return {
    ...view,
    relays: queriedRelays,
  };
}

async function handleRoadmapList(ctx: Parameters<BuiltinHandler>[0]) {
  const view = await loadRoadmap(ctx);

  if (ctx.source === 'web') {
    return renderRoadmapWeb(view);
  }

  return renderRoadmap(view);
}

async function handleRoadmapBoard(ctx: Parameters<BuiltinHandler>[0]) {
  const target = positionalArg(ctx.args.slice(1), 0);
  const view = await loadRoadmap(ctx);

  const workflow = view.workflows.find(
    (entry) => entry.id === target || entry.key === target,
  );

  if (!workflow) {
    return `Roadmap board not found: ${target || '(missing id)'}`;
  }

  if (ctx.source === 'web') {
    return renderRoadmapWeb({ ...view, mode: 'board', workflows: [workflow] });
  }

  return renderRoadmap({ ...view, workflows: [workflow] });
}

function handleRoadmapFund(ctx: Parameters<BuiltinHandler>[0]) {
  const args = ctx.args.slice(1);
  const issueId = positionalArg(args, 0);
  const title = optionArg(args, '--title') || 'roadmap issue';
  const sats = Number(optionArg(args, '--sats') || 0);
  const relays = relayArgs(args);
  const relay = relays[0] ?? '';

  if (ctx.source === 'web') {
    return renderRoadmapFundWeb({
      issueId,
      title,
      sats: Number.isFinite(sats) ? sats : 0,
      relay,
    });
  }

  return `Fund ${title}: ${formatSats(Number.isFinite(sats) ? sats : 0)} currently verified. Funding execution is not wired yet.`;
}

async function handleRoadmapError(
  fn: () => Promise<Awaited<ReturnType<typeof handleRoadmapList>>>,
) {
  try {
    return await fn();
  } catch (err) {
    return `Failed to read roadmap: ${String(err)}`;
  }
}

export const handleRoadmapRoot: BuiltinHandler = (ctx) => {
  const sub = ctx.args[0]?.toLowerCase() ?? 'list';

  if (sub === 'help') {
    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: ctx.prefix,
        root: 'roadmap',
        topic: ctx.args[1]?.toLowerCase() ?? null,
      }),
    );
  }

  if (sub === 'list') {
    return handleRoadmapError(async () => handleRoadmapList(ctx));
  }

  if (sub === 'board') {
    return handleRoadmapError(async () => handleRoadmapBoard(ctx));
  }

  if (sub === 'fund' || sub === 'zap') {
    return Promise.resolve(handleRoadmapFund(ctx));
  }

  if (sub === 'new' || sub === 'add') {
    const repo = positionalArg(ctx.args.slice(1), 0);

    return Promise.resolve(
      `Roadmap issue creation publishes from the web client with your Nostr signer. Open /roadmap board for repo ${repo || '(missing repo)'}.`,
    );
  }

  return Promise.resolve(
    `Unknown roadmap command: ${sub}. Try ${ctx.prefix}roadmap list`,
  );
};
