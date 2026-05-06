import type { NostrEvent } from 'nostr-tools';

import { APPWEAVER_RELAY } from '@src/appweaver-relay';

import type { BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import { renderRoadmapFundWeb, renderRoadmapWeb } from './renderers/web';

const PROJECT_KIND = 30617;
const ISSUE_KIND = 1621;
const STATUS_RESOLVED_KIND = 1631;
const STATUS_CLOSED_KIND = 1632;
const COMMENT_KIND = 1111;
const WORKFLOW_KIND = 39010;
const TRACKER_KIND = 39011;
const ZAP_KIND = 9735;
const MSATS_PER_SAT = 1000;

export type IssueView = {
  id: string;
  project: string;
  subject: string;
  content: string;
  labels: string[];
  createdAt: number;
  fundingSats: number;
  zapCount: number;
  commentCount: number;
  status: string | null;
};

export type WorkflowView = {
  id: string;
  key: string;
  title: string;
  projectName: string;
  projectAddress: string;
  columns: { id: string; label: string; issues: IssueView[] }[];
};

export type RoadmapView = {
  relay: string;
  mode?: 'overview' | 'board';
  issueCount: number;
  zapCount: number;
  workflows: WorkflowView[];
};

function tagValue(event: NostrEvent, name: string): string {
  return event.tags.find((tag) => tag[0] === name)?.[1] ?? '';
}

function tags(event: NostrEvent, name: string): string[][] {
  return event.tags.filter((tag) => tag[0] === name);
}

function eventReference(event: NostrEvent, name: string): string {
  return tags(event, name).find((tag) => tag[1])?.[1] ?? '';
}

function relayArg(args: string[]): string {
  const relayIndex = args.findIndex((arg) => arg === '--relay');

  if (relayIndex >= 0) {
    return args[relayIndex + 1] ?? APPWEAVER_RELAY;
  }

  return APPWEAVER_RELAY;
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

function amountSats(event: NostrEvent): number {
  const amount = Number(tagValue(event, 'amount'));

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return Math.floor(amount / MSATS_PER_SAT);
}

function formatSats(value: number): string {
  return `${value.toLocaleString('en-US')} sats`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function issueSort(a: IssueView, b: IssueView): number {
  if (b.fundingSats !== a.fundingSats) {
    return b.fundingSats - a.fundingSats;
  }

  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }

  return a.id.localeCompare(b.id);
}

function latestByKey(
  events: NostrEvent[],
  keyFn: (event: NostrEvent) => string,
): Map<string, NostrEvent> {
  const latest = new Map<string, NostrEvent>();

  for (const event of events) {
    const key = keyFn(event);

    if (!key) {
      continue;
    }

    const existing = latest.get(key);

    if (
      !existing ||
      event.created_at > existing.created_at ||
      (event.created_at === existing.created_at && event.id > existing.id)
    ) {
      latest.set(key, event);
    }
  }

  return latest;
}

function issueView({
  issue,
  projectName,
  fundingByIssue,
  zapCountByIssue,
  commentCountByIssue,
  statusByIssue,
}: {
  issue: NostrEvent;
  projectName: string;
  fundingByIssue: Map<string, number>;
  zapCountByIssue: Map<string, number>;
  commentCountByIssue: Map<string, number>;
  statusByIssue: Map<string, string>;
}): IssueView {
  return {
    id: issue.id,
    project: projectName,
    subject: tagValue(issue, 'subject') || '(untitled issue)',
    content: issue.content,
    labels: tags(issue, 't')
      .map((tag) => tag[1])
      .filter(Boolean),
    createdAt: issue.created_at,
    fundingSats: fundingByIssue.get(issue.id) ?? 0,
    zapCount: zapCountByIssue.get(issue.id) ?? 0,
    commentCount: commentCountByIssue.get(issue.id) ?? 0,
    status: statusByIssue.get(issue.id) ?? null,
  };
}

function renderIssue(issue: IssueView): string {
  const status = issue.status ? ` · ${issue.status}` : '';
  const labels = issue.labels.length > 0 ? ` · ${issue.labels.join(', ')}` : '';

  return `- ${issue.subject} (${formatSats(issue.fundingSats)}, ${issue.zapCount} zap${issue.zapCount === 1 ? '' : 's'}, ${issue.commentCount} comment${issue.commentCount === 1 ? '' : 's'}${status}${labels}) #${shortId(issue.id)}`;
}

function renderRoadmap(view: RoadmapView): string {
  const lines = [
    `Roadmap (${view.relay})`,
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

function materializeRoadmap({
  relay,
  events,
}: {
  relay: string;
  events: NostrEvent[];
}): RoadmapView {
  const projects = events.filter((event) => event.kind === PROJECT_KIND);
  const issues = events.filter((event) => event.kind === ISSUE_KIND);
  const workflows = events.filter((event) => event.kind === WORKFLOW_KIND);
  const trackers = events.filter((event) => event.kind === TRACKER_KIND);
  const zaps = events.filter((event) => event.kind === ZAP_KIND);
  const comments = events.filter((event) => event.kind === COMMENT_KIND);

  const statuses = events.filter(
    (event) =>
      event.kind === STATUS_RESOLVED_KIND || event.kind === STATUS_CLOSED_KIND,
  );

  const projectNameByAddress = new Map(
    projects.map((event) => [
      `${event.kind}:${event.pubkey}:${tagValue(event, 'd')}`,
      tagValue(event, 'name') || tagValue(event, 'd') || shortId(event.id),
    ]),
  );

  const issuesById = new Map(issues.map((event) => [event.id, event]));
  const fundingByIssue = new Map<string, number>();
  const zapCountByIssue = new Map<string, number>();

  for (const zap of zaps) {
    const issueId = eventReference(zap, 'e');

    if (!issueId || !issuesById.has(issueId)) {
      continue;
    }

    fundingByIssue.set(
      issueId,
      (fundingByIssue.get(issueId) ?? 0) + amountSats(zap),
    );

    zapCountByIssue.set(issueId, (zapCountByIssue.get(issueId) ?? 0) + 1);
  }

  const commentCountByIssue = new Map<string, number>();

  for (const comment of comments) {
    const issueId =
      eventReference(comment, 'E') || eventReference(comment, 'e');

    if (issueId && issuesById.has(issueId)) {
      commentCountByIssue.set(
        issueId,
        (commentCountByIssue.get(issueId) ?? 0) + 1,
      );
    }
  }

  const statusByIssue = new Map<string, string>();

  const latestStatuses = latestByKey(statuses, (event) =>
    eventReference(event, 'e'),
  );

  for (const [issueId, status] of latestStatuses) {
    statusByIssue.set(
      issueId,
      status.kind === STATUS_RESOLVED_KIND ? 'resolved' : 'closed',
    );
  }

  const workflowAddressById = new Map(
    workflows.map((event) => [
      event.id,
      `${event.kind}:${event.pubkey}:${tagValue(event, 'd')}`,
    ]),
  );

  const latestTrackers = latestByKey(trackers, (event) => {
    const issueId = eventReference(event, 'e');

    const workflow =
      tags(event, 'a').find((tag) => tag[3] === 'workflow')?.[1] ?? '';

    return issueId && workflow ? `${workflow}:${issueId}` : '';
  });

  const assignedIssueIdsByWorkflow = new Map<string, Set<string>>();
  const trackerByWorkflow = new Map<string, NostrEvent[]>();

  for (const tracker of latestTrackers.values()) {
    const issueId = eventReference(tracker, 'e');

    const workflow =
      tags(tracker, 'a').find((tag) => tag[3] === 'workflow')?.[1] ?? '';

    if (!issueId || !workflow || !issuesById.has(issueId)) {
      continue;
    }

    assignedIssueIdsByWorkflow.set(
      workflow,
      new Set([...(assignedIssueIdsByWorkflow.get(workflow) ?? []), issueId]),
    );

    trackerByWorkflow.set(workflow, [
      ...(trackerByWorkflow.get(workflow) ?? []),
      tracker,
    ]);
  }

  const toIssueView = (issue: NostrEvent): IssueView => {
    const projectAddress = tagValue(issue, 'a');

    return issueView({
      issue,
      projectName: projectNameByAddress.get(projectAddress) ?? projectAddress,
      fundingByIssue,
      zapCountByIssue,
      commentCountByIssue,
      statusByIssue,
    });
  };

  const workflowViews = workflows.map((workflow) => {
    const workflowAddress = workflowAddressById.get(workflow.id) ?? '';
    const workflowTrackers = trackerByWorkflow.get(workflowAddress) ?? [];

    const projectAddress =
      tags(workflow, 'a').find((tag) => tag[3] === 'project')?.[1] ?? '';

    const assignedForWorkflow =
      assignedIssueIdsByWorkflow.get(workflowAddress) ?? new Set<string>();

    const pendingIssues = issues
      .filter((issue) => tagValue(issue, 'a') === projectAddress)
      .filter((issue) => !assignedForWorkflow.has(issue.id))
      .map(toIssueView)
      .sort(issueSort);

    const columns = [
      {
        id: 'pending',
        label: 'Unassigned',
        issues: pendingIssues,
      },
      ...tags(workflow, 'col').map((column) => {
        const columnId = column[1] ?? '';

        const columnIssues = workflowTrackers
          .filter((tracker) => tracker.content === columnId)
          .sort(
            (a, b) =>
              Number(tagValue(a, 'rank') || 0) -
              Number(tagValue(b, 'rank') || 0),
          )
          .map((tracker) => issuesById.get(eventReference(tracker, 'e')))
          .filter((issue): issue is NostrEvent => issue !== undefined)
          .map(toIssueView);

        return {
          id: columnId,
          label: column[2] ?? columnId,
          issues: columnIssues,
        };
      }),
    ];

    return {
      id: workflow.id,
      key: tagValue(workflow, 'd') || workflow.id,
      projectAddress,
      projectName: projectNameByAddress.get(projectAddress) ?? projectAddress,
      title:
        tagValue(workflow, 'title') ||
        tagValue(workflow, 'd') ||
        shortId(workflow.id),
      columns,
    };
  });

  return {
    relay,
    issueCount: issues.length,
    zapCount: zaps.length,
    workflows: workflowViews,
  };
}

async function loadRoadmap(ctx: Parameters<BuiltinHandler>[0]) {
  const relay = relayArg(ctx.args.slice(1));

  const events = await ctx.pool.querySync(
    [relay],
    {
      kinds: [
        PROJECT_KIND,
        ISSUE_KIND,
        STATUS_RESOLVED_KIND,
        STATUS_CLOSED_KIND,
        COMMENT_KIND,
        WORKFLOW_KIND,
        TRACKER_KIND,
        ZAP_KIND,
      ],
      limit: 500,
    },
    { maxWait: 2_000 },
  );

  return materializeRoadmap({ relay, events });
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
  const relay = relayArg(args);

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
      `Roadmap issue creation is not wired yet. The issue will publish as NIP-34 kind 1621 with repo tag ${repo || '(missing repo)'} once submission is enabled.`,
    );
  }

  return Promise.resolve(
    `Unknown roadmap command: ${sub}. Try ${ctx.prefix}roadmap list`,
  );
};
