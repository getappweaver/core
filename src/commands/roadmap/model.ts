import type { NostrEvent } from 'nostr-tools';

import {
  authorHref,
  fallbackAuthorIdentity,
  normalizeNip05,
  type AuthorIdentity,
} from '@src/nostr/author-identity';
import {
  NIP65_RELAY_LIST_KIND,
  parseNip65RelayTags,
  PROFILE_RELAYS_FOR_QUERY,
} from '@src/nostr/nip65';

export const PROFILE_KIND = 0;
export const PROJECT_KIND = 30617;
export const ISSUE_KIND = 1621;
export const STATUS_OPEN_KIND = 1630;
export const STATUS_RESOLVED_KIND = 1631;
export const STATUS_CLOSED_KIND = 1632;
export const STATUS_DRAFT_KIND = 1633;
export const COMMENT_KIND = 1111;
export const DELETE_KIND = 5;
export const PLUGIN_KIND = 32107;
export const WORKFLOW_KIND = 39010;
export const TRACKER_KIND = 39011;
export const ZAP_KIND = 9735;
export const ROADMAP_RELAY_DISCOVERY_RELAYS = PROFILE_RELAYS_FOR_QUERY;

export const ROADMAP_EVENT_KINDS = [
  PROJECT_KIND,
  PROFILE_KIND,
  NIP65_RELAY_LIST_KIND,
  DELETE_KIND,
  ISSUE_KIND,
  STATUS_OPEN_KIND,
  STATUS_RESOLVED_KIND,
  STATUS_CLOSED_KIND,
  STATUS_DRAFT_KIND,
  COMMENT_KIND,
  PLUGIN_KIND,
  WORKFLOW_KIND,
  TRACKER_KIND,
  ZAP_KIND,
] as const;

const MSATS_PER_SAT = 1000;

export type IssueView = {
  id: string;
  project: string;
  projectAddress: string;
  repoRelays: string[];
  authorPubkey: string;
  repoMaintainers: string[];
  subject: string;
  content: string;
  labels: string[];
  createdAt: number;
  fundingSats: number;
  zapCount: number;
  commentCount: number;
  comments: {
    id: string;
    authorPubkey: string;
    content: string;
    createdAt: number;
  }[];
  status: string | null;
};

export type WorkflowView = {
  id: string;
  address: string;
  key: string;
  authorPubkey: string;
  author: AuthorIdentity;
  title: string;
  projectName: string;
  projectAddress: string;
  repoRelays: string[];
  columns: { id: string; label: string; issues: IssueView[] }[];
};

export type RoadmapProjectView = {
  address: string;
  authorPubkey: string;
  name: string;
  description: string;
  repoRelays: string[];
  ownerWriteRelays: string[];
};

export type RoadmapView = {
  relay: string;
  relays: string[];
  mode?: 'overview' | 'board';
  issueCount: number;
  zapCount: number;
  projects: RoadmapProjectView[];
  workflows: WorkflowView[];
};

function tagValue(event: NostrEvent, name: string): string {
  return event.tags.find((tag) => tag[0] === name)?.[1] ?? '';
}

function profileNip05(event: NostrEvent): string | null {
  const profile = profileContent(event);

  return typeof profile?.nip05 === 'string' ? profile.nip05 : null;
}

function profileContent(event: NostrEvent): Record<string, unknown> | null {
  try {
    const content = JSON.parse(event.content) as unknown;

    return content && typeof content === 'object'
      ? (content as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function profileAuthorIdentity(
  pubkey: string,
  event: NostrEvent,
): AuthorIdentity {
  const profile = profileContent(event);
  const normalized = normalizeNip05(profileNip05(event) ?? '');
  const lud16 = typeof profile?.lud16 === 'string' ? profile.lud16 : null;
  const lud06 = typeof profile?.lud06 === 'string' ? profile.lud06 : null;

  if (!normalized) {
    return { ...fallbackAuthorIdentity(pubkey), lud16, lud06 };
  }

  return {
    label: normalized,
    href: authorHref(normalized),
    verified: false,
    nip05: normalized,
    lud16,
    lud06,
  };
}

function tags(event: NostrEvent, name: string): string[][] {
  return event.tags.filter((tag) => tag[0] === name);
}

function eventReference(event: NostrEvent, name: string): string {
  return tags(event, name).find((tag) => tag[1])?.[1] ?? '';
}

function projectAddress(event: NostrEvent): string {
  const identifier = tagValue(event, 'd');

  return identifier ? `${event.kind}:${event.pubkey}:${identifier}` : '';
}

export function normalizeRoadmapRelay(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const withProtocol = /^wss?:\/\//i.test(trimmed)
    ? trimmed
    : `wss://${trimmed}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function uniqueRoadmapRelays(relays: readonly string[]): string[] {
  return [
    ...new Set(
      relays
        .map((relay) => normalizeRoadmapRelay(relay))
        .filter((relay): relay is string => relay !== null),
    ),
  ];
}

export function repoRelaysForProject(
  event: NostrEvent | null,
  relayListsByPubkey: Map<string, NostrEvent> | null,
): string[] {
  if (!event) {
    return [...ROADMAP_RELAY_DISCOVERY_RELAYS];
  }

  const announcementRelays = uniqueRoadmapRelays(
    tags(event, 'relays').flatMap((tag) => tag.slice(1)),
  );

  if (announcementRelays.length > 0) {
    return announcementRelays;
  }

  return repoNip65RelaysForProject(event, relayListsByPubkey);
}

export function repoNip65RelaysForProject(
  event: NostrEvent | null,
  relayListsByPubkey: Map<string, NostrEvent> | null,
): string[] {
  if (!event) {
    return [...ROADMAP_RELAY_DISCOVERY_RELAYS];
  }

  const relays = parseNip65RelayTags(
    relayListsByPubkey?.get(event.pubkey)?.tags ?? [],
  ).writeRelays;

  return relays.length > 0 ? relays : [...ROADMAP_RELAY_DISCOVERY_RELAYS];
}

function workflowProjectAddress(event: NostrEvent): string {
  return tags(event, 'a').find((tag) => tag[3] === 'project')?.[1] ?? '';
}

function workflowReference(event: NostrEvent): string {
  return tags(event, 'a').find((tag) => tag[3] === 'workflow')?.[1] ?? '';
}

function amountSats(event: NostrEvent): number {
  const amount = Number(tagValue(event, 'amount'));

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return Math.floor(amount / MSATS_PER_SAT);
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
  commentsByIssue,
  statusByIssue,
  ownerByProject,
  repoRelaysByProject,
}: {
  issue: NostrEvent;
  projectName: string;
  fundingByIssue: Map<string, number>;
  zapCountByIssue: Map<string, number>;
  commentCountByIssue: Map<string, number>;
  commentsByIssue: Map<string, NostrEvent[]>;
  statusByIssue: Map<string, string>;
  ownerByProject: Map<string, string>;
  repoRelaysByProject: Map<string, string[]>;
}): IssueView {
  const address = tagValue(issue, 'a');

  return {
    id: issue.id,
    project: projectName,
    projectAddress: address,
    repoRelays: repoRelaysByProject.get(address) ?? [],
    authorPubkey: issue.pubkey,
    repoMaintainers: [ownerByProject.get(tagValue(issue, 'a')) ?? ''].filter(
      Boolean,
    ),
    subject: tagValue(issue, 'subject') || '(untitled issue)',
    content: issue.content,
    labels: tags(issue, 't')
      .map((tag) => tag[1])
      .filter(Boolean),
    createdAt: issue.created_at,
    fundingSats: fundingByIssue.get(issue.id) ?? 0,
    zapCount: zapCountByIssue.get(issue.id) ?? 0,
    commentCount: commentCountByIssue.get(issue.id) ?? 0,
    comments: (commentsByIssue.get(issue.id) ?? []).map((comment) => ({
      id: comment.id,
      authorPubkey: comment.pubkey,
      content: comment.content,
      createdAt: comment.created_at,
    })),
    status: statusByIssue.get(issue.id) ?? null,
  };
}

export function materializeRoadmap({
  relay,
  events,
  authorIdentities,
  zapReceiptPubkeys,
  zapReceiptPubkeysByProjectAddress,
}: {
  relay: string;
  events: NostrEvent[];
  authorIdentities: Map<string, AuthorIdentity> | null;
  zapReceiptPubkeys: Set<string> | null;
  zapReceiptPubkeysByProjectAddress: Map<string, Set<string>> | null;
}): RoadmapView {
  const projects = [
    ...latestByKey(
      events.filter((event) => event.kind === PROJECT_KIND),
      projectAddress,
    ).values(),
  ];

  const profilesByPubkey = latestByKey(
    events.filter((event) => event.kind === PROFILE_KIND),
    (event) => event.pubkey,
  );

  const relayListsByPubkey = latestByKey(
    events.filter((event) => event.kind === NIP65_RELAY_LIST_KIND),
    (event) => event.pubkey,
  );

  const authorIdentityByPubkey = new Map(
    [...profilesByPubkey].map(([pubkey, event]) => [
      pubkey,
      profileAuthorIdentity(pubkey, event),
    ]),
  );

  for (const [pubkey, identity] of authorIdentities ?? []) {
    authorIdentityByPubkey.set(pubkey, identity);
  }

  const zaps = events.filter((event) => event.kind === ZAP_KIND);

  const pluginEventsById = new Map(
    events
      .filter((event) => event.kind === PLUGIN_KIND)
      .map((event) => [event.id, event]),
  );

  const comments = events.filter((event) => event.kind === COMMENT_KIND);
  const deletions = events.filter((event) => event.kind === DELETE_KIND);

  const statuses = events.filter(
    (event) =>
      event.kind === STATUS_OPEN_KIND ||
      event.kind === STATUS_RESOLVED_KIND ||
      event.kind === STATUS_CLOSED_KIND ||
      event.kind === STATUS_DRAFT_KIND,
  );

  const projectEventsByAddress = new Map(
    projects
      .map((event) => [projectAddress(event), event] as const)
      .filter(([address]) => address),
  );

  const ownerByProject = new Map(
    [...projectEventsByAddress].map(([address, event]) => [
      address,
      event.pubkey,
    ]),
  );

  const repoRelaysByProject = new Map(
    [...projectEventsByAddress].map(([address, event]) => [
      address,
      repoRelaysForProject(event, relayListsByPubkey),
    ]),
  );

  const projectViews = [...projectEventsByAddress]
    .map(([address, event]) => ({
      address,
      authorPubkey: event.pubkey,
      name: tagValue(event, 'name') || tagValue(event, 'd') || address,
      description: tagValue(event, 'description'),
      repoRelays: repoRelaysByProject.get(address) ?? [],
      ownerWriteRelays: parseNip65RelayTags(
        relayListsByPubkey.get(event.pubkey)?.tags ?? [],
      ).writeRelays,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rawIssues = events
    .filter((event) => event.kind === ISSUE_KIND)
    .filter((event) => projectEventsByAddress.has(tagValue(event, 'a')));

  const rawIssuesById = new Map(rawIssues.map((event) => [event.id, event]));
  const deletedIssueIds = new Set<string>();

  for (const deletion of deletions) {
    for (const tag of tags(deletion, 'e')) {
      const issue = rawIssuesById.get(tag[1] ?? '');

      if (issue && issue.pubkey === deletion.pubkey) {
        deletedIssueIds.add(issue.id);
      }
    }
  }

  const issues = rawIssues.filter((event) => !deletedIssueIds.has(event.id));

  const workflows = events
    .filter((event) => event.kind === WORKFLOW_KIND)
    .filter((event) => {
      const pluginRef = tags(event, 'e').find(
        (tag) => tag[3] === 'plugin',
      )?.[1];

      const pluginEvent = pluginRef ? pluginEventsById.get(pluginRef) : null;

      if (pluginRef && pluginEvent?.pubkey !== event.pubkey) {
        return false;
      }

      return ownerByProject.get(workflowProjectAddress(event)) === event.pubkey;
    });

  const projectNameByAddress = new Map(
    [...projectEventsByAddress].map(([address, event]) => [
      address,
      tagValue(event, 'name') || tagValue(event, 'd') || shortId(event.id),
    ]),
  );

  const issuesById = new Map(issues.map((event) => [event.id, event]));
  const fundingByIssue = new Map<string, number>();
  const zapCountByIssue = new Map<string, number>();
  let verifiedZapCount = 0;

  for (const zap of zaps) {
    const issueId = eventReference(zap, 'e');
    const sats = amountSats(zap);
    const issue = issueId ? issuesById.get(issueId) : undefined;

    if (!issueId || !issue || sats <= 0) {
      continue;
    }

    const projectZapPubkeys = zapReceiptPubkeysByProjectAddress?.get(
      tagValue(issue, 'a'),
    );

    if (projectZapPubkeys !== undefined && !projectZapPubkeys.has(zap.pubkey)) {
      continue;
    }

    if (
      projectZapPubkeys === undefined &&
      zapReceiptPubkeys !== null &&
      !zapReceiptPubkeys.has(zap.pubkey)
    ) {
      continue;
    }

    if (
      projectZapPubkeys === undefined &&
      zapReceiptPubkeysByProjectAddress !== null
    ) {
      continue;
    }

    fundingByIssue.set(issueId, (fundingByIssue.get(issueId) ?? 0) + sats);

    zapCountByIssue.set(issueId, (zapCountByIssue.get(issueId) ?? 0) + 1);
    verifiedZapCount += 1;
  }

  const commentCountByIssue = new Map<string, number>();
  const commentsByIssue = new Map<string, NostrEvent[]>();

  for (const comment of comments) {
    const issueId =
      eventReference(comment, 'E') || eventReference(comment, 'e');

    if (issueId && issuesById.has(issueId)) {
      commentCountByIssue.set(
        issueId,
        (commentCountByIssue.get(issueId) ?? 0) + 1,
      );

      commentsByIssue.set(issueId, [
        ...(commentsByIssue.get(issueId) ?? []),
        comment,
      ]);
    }
  }

  for (const [issueId, issueComments] of commentsByIssue) {
    commentsByIssue.set(
      issueId,
      issueComments.sort(
        (a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id),
      ),
    );
  }

  const statusByIssue = new Map<string, string>();

  const latestStatuses = latestByKey(
    statuses.filter((event) => {
      const issue = issuesById.get(eventReference(event, 'e'));

      if (!issue) {
        return false;
      }

      return (
        event.pubkey === issue.pubkey ||
        ownerByProject.get(tagValue(issue, 'a')) === event.pubkey
      );
    }),
    (event) => eventReference(event, 'e'),
  );

  for (const [issueId, status] of latestStatuses) {
    if (status.kind === STATUS_RESOLVED_KIND) {
      statusByIssue.set(issueId, 'resolved');
    } else if (status.kind === STATUS_CLOSED_KIND) {
      statusByIssue.set(issueId, 'closed');
    } else if (status.kind === STATUS_DRAFT_KIND) {
      statusByIssue.set(issueId, 'draft');
    }
  }

  const workflowAddressById = new Map(
    workflows.map((event) => [
      event.id,
      `${event.kind}:${event.pubkey}:${tagValue(event, 'd')}`,
    ]),
  );

  const workflowProjectByAddress = new Map(
    workflows.map((event) => [
      workflowAddressById.get(event.id) ?? '',
      workflowProjectAddress(event),
    ]),
  );

  const workflowAuthorByAddress = new Map(
    workflows.map((event) => [
      workflowAddressById.get(event.id) ?? '',
      event.pubkey,
    ]),
  );

  const trackers = events
    .filter((event) => event.kind === TRACKER_KIND)
    .filter((event) => {
      const issue = issuesById.get(eventReference(event, 'e'));
      const workflow = workflowReference(event);
      const project = workflowProjectByAddress.get(workflow) ?? '';

      return (
        issue !== undefined &&
        project !== '' &&
        tagValue(issue, 'a') === project &&
        workflowAuthorByAddress.get(workflow) === event.pubkey &&
        ownerByProject.get(project) === event.pubkey
      );
    });

  const latestTrackers = latestByKey(trackers, (event) => {
    const issueId = eventReference(event, 'e');
    const workflow = workflowReference(event);

    return issueId && workflow ? `${workflow}:${issueId}` : '';
  });

  const assignedIssueIdsByWorkflow = new Map<string, Set<string>>();
  const trackerByWorkflow = new Map<string, NostrEvent[]>();

  const columnIdsByWorkflow = new Map(
    workflows.map((workflow) => [
      workflowAddressById.get(workflow.id) ?? '',
      new Set(tags(workflow, 'col').map((column) => column[1] ?? '')),
    ]),
  );

  for (const tracker of latestTrackers.values()) {
    const issueId = eventReference(tracker, 'e');
    const workflow = workflowReference(tracker);

    if (!issueId || !workflow || !issuesById.has(issueId)) {
      continue;
    }

    if (!columnIdsByWorkflow.get(workflow)?.has(tracker.content)) {
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
    const address = tagValue(issue, 'a');

    return issueView({
      issue,
      projectName: projectNameByAddress.get(address) ?? address,
      fundingByIssue,
      zapCountByIssue,
      commentCountByIssue,
      commentsByIssue,
      statusByIssue,
      ownerByProject,
      repoRelaysByProject,
    });
  };

  const workflowViews = workflows.map((workflow) => {
    const workflowAddress = workflowAddressById.get(workflow.id) ?? '';
    const workflowTrackers = trackerByWorkflow.get(workflowAddress) ?? [];

    const workflowProject = workflowProjectAddress(workflow);

    const assignedForWorkflow =
      assignedIssueIdsByWorkflow.get(workflowAddress) ?? new Set<string>();

    const pendingIssues = issues
      .filter((issue) => tagValue(issue, 'a') === workflowProject)
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
      address: workflowAddress,
      key: tagValue(workflow, 'd') || workflow.id,
      authorPubkey: workflow.pubkey,
      author:
        authorIdentityByPubkey.get(workflow.pubkey) ??
        fallbackAuthorIdentity(workflow.pubkey),
      projectAddress: workflowProject,
      repoRelays: repoRelaysByProject.get(workflowProject) ?? [],
      projectName: projectNameByAddress.get(workflowProject) ?? workflowProject,
      title:
        tagValue(workflow, 'title') ||
        tagValue(workflow, 'd') ||
        shortId(workflow.id),
      columns,
    };
  });

  return {
    relay,
    relays: [relay].filter(Boolean),
    issueCount: issues.length,
    zapCount: verifiedZapCount,
    projects: projectViews,
    workflows: workflowViews,
  };
}
