import type {
  WebAction,
  WebElementNode,
  WebNode,
  WebNodeRoot,
} from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

import type { IssueView, RoadmapView, WorkflowView } from '../model';

import { roadmapStylesheet } from './styles';

const ROADMAP_COLUMN_VISIBLE_LIMIT = 5;

const DEFAULT_WORKFLOW_COLUMNS = [
  'Planning',
  'In Progress',
  'Test',
  'Done',
  'Rejected',
] as const;

const EXTRA_WORKFLOW_COLUMN_COUNT = 3;

function boardAction(workflow: WorkflowView, relay: string): WebAction {
  return {
    type: 'command',
    command: 'roadmap',
    subcommand: 'board',
    arguments: { id: workflow.key },
    options: relay ? { relay } : {},
    recordInTimeline: true,
  };
}

function fundIssueAction(issue: IssueView, relay: string): WebAction {
  return {
    type: 'command',
    command: 'roadmap',
    subcommand: 'fund',
    arguments: {
      issueId: issue.id,
    },
    options: {
      title: issue.subject,
      sats: issue.fundingSats,
      relay,
      relays: issue.repoRelays,
    },
    surface: 'modal',
    modalTitle: `Fund "${issue.subject}"`,
    recordInTimeline: false,
  };
}

function badge(
  label: string,
  tone: 'muted' | 'success' | 'warning' | 'info',
  className: string | null = null,
  action: WebAction | null = null,
): WebNode {
  return {
    type: 'element',
    tag: 'badge',
    props: {
      label,
      tone,
      size: 'sm',
      ...(className ? { className } : {}),
      ...(action ? { action, stopPropagation: true } : {}),
    },
  };
}

function filterByLabelAction(label: string): WebAction {
  return {
    type: 'clientAction',
    action: 'web.toggleTreeFilter',
    payload: { value: label },
  };
}

function openNewWorkflowAction(view: RoadmapView): WebAction {
  return {
    type: 'clientAction',
    action: 'roadmap.openNewWorkflow',
    payload: {
      relay: view.relay,
      relays: view.relays,
    },
  };
}

function formatSats(value: number): string {
  return `${value.toLocaleString('en-US')} sats`;
}

function classSuffix(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function issueDescription(content: string): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: { whiteSpace: 'pre-wrap', className: 'roadmap-description' },
    children: [textNode(content)],
  };
}

function issueDescriptionPreview({
  issue,
  workflow,
  relay,
  boardKey,
  columnId,
}: {
  issue: IssueView;
  workflow: WorkflowView | null;
  relay: string;
  boardKey: string | null;
  columnId: string | null;
}): WebNode | null {
  const content = issue.content.trim();
  const limit = 180;

  if (!content) {
    return null;
  }

  if (content.length <= limit) {
    return issueDescription(content);
  }

  return {
    type: 'element',
    tag: 'text',
    props: { whiteSpace: 'pre-wrap', className: 'roadmap-description' },
    children: [
      textNode(`${content.slice(0, limit).trimEnd()}... `),
      {
        type: 'element',
        tag: 'button',
        props: {
          label: 'More',
          className: 'web-button web-button--link roadmap-meta-action',
          stopPropagation: true,
          action: openIssueAction({
            issue,
            workflow,
            relay,
            boardKey,
            columnId,
            focus: 'activity',
          }),
        },
      },
    ],
  };
}

function readableMuted(value: string): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: { whiteSpace: 'pre-wrap', className: 'roadmap-readable-muted' },
    children: [textNode(value)],
  };
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function metaBadges(labels: string[]): WebNode {
  return {
    type: 'element',
    tag: 'row',
    props: { gap: 'xs', className: 'roadmap-meta-badges' },
    children: labels.map((label) =>
      badge(label, 'muted', 'roadmap-meta-badge'),
    ),
  };
}

export type RoadmapWorkflowPayload = {
  id: string;
  address: string;
  key: string;
  title: string;
  authorPubkey: string;
  projectAddress: string;
  repoRelays: string[];
  columns: { id: string; label: string }[];
};

export type RoadmapIssuePayload = {
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
  comments: IssueView['comments'];
  status: string | null;
};

export type RoadmapCapabilities = {
  canCreate: boolean;
  canComment: boolean;
  canMove: boolean;
  canMark: boolean;
  canDelete: boolean;
};

export type RoadmapProjectPayload = {
  address: string;
  authorPubkey: string;
  name: string;
  description: string;
  repoRelays: string[];
  ownerWriteRelays: string[];
};

type RoadmapCapabilityProps = {
  issue: RoadmapIssuePayload;
  workflow: RoadmapWorkflowPayload | null;
  availableSignerPubkeys: string[] | null;
};

export function roadmapCapabilities({
  issue,
  workflow,
  availableSignerPubkeys,
}: RoadmapCapabilityProps): RoadmapCapabilities {
  if (availableSignerPubkeys === null) {
    return {
      canCreate: true,
      canComment: true,
      canMove: workflow !== null,
      canMark: true,
      canDelete: false,
    };
  }

  const signers = new Set(availableSignerPubkeys.filter(Boolean));
  const repoOwner = issue.projectAddress.split(':')[1] ?? '';

  return {
    canCreate: true,
    canComment: true,
    canMove: workflow !== null && signers.has(workflow.authorPubkey),
    canMark: [issue.authorPubkey, repoOwner, ...issue.repoMaintainers].some(
      (pubkey) => signers.has(pubkey),
    ),
    canDelete: signers.has(issue.authorPubkey),
  };
}

export function workflowPayload(
  workflow: WorkflowView,
): RoadmapWorkflowPayload {
  return {
    id: workflow.id,
    address: workflow.address,
    key: workflow.key,
    title: workflow.title,
    authorPubkey: workflow.authorPubkey,
    projectAddress: workflow.projectAddress,
    repoRelays: workflow.repoRelays,
    columns: workflow.columns.map((column) => ({
      id: column.id,
      label: column.label,
    })),
  };
}

export function issuePayload(issue: IssueView): RoadmapIssuePayload {
  return {
    id: issue.id,
    project: issue.project,
    projectAddress: issue.projectAddress,
    repoRelays: issue.repoRelays,
    authorPubkey: issue.authorPubkey,
    repoMaintainers: issue.repoMaintainers,
    subject: issue.subject,
    content: issue.content,
    labels: issue.labels,
    createdAt: issue.createdAt,
    fundingSats: issue.fundingSats,
    zapCount: issue.zapCount,
    commentCount: issue.commentCount,
    comments: issue.comments,
    status: issue.status,
  };
}

function openIssueAction({
  issue,
  workflow,
  relay,
  boardKey,
  columnId,
  focus,
}: {
  issue: IssueView;
  workflow: WorkflowView | null;
  relay: string;
  boardKey: string | null;
  columnId: string | null;
  focus: 'activity' | 'comments' | 'manage';
}): WebAction {
  return {
    type: 'clientAction',
    action: 'roadmap.openIssue',
    payload: {
      issue: issuePayload(issue),
      workflow: workflow ? workflowPayload(workflow) : null,
      relay,
      boardKey,
      columnId,
      focus,
    },
  };
}

function openNewIssueAction({
  workflow,
  relay,
}: {
  workflow: WorkflowView;
  relay: string;
}): WebAction {
  return {
    type: 'clientAction',
    action: 'roadmap.openNewIssue',
    payload: { workflow: workflowPayload(workflow), relay },
  };
}

function issueFilterText(issue: IssueView, status: string): string {
  return [
    issue.subject,
    issue.content,
    issue.project,
    status,
    issue.status ?? '',
    ...issue.labels.flatMap((label) => [label, `label:${label}`]),
  ].join(' ');
}

function issueTitleButton({
  issue,
  workflow,
  relay,
  boardKey,
  columnId,
}: {
  issue: IssueView;
  workflow: WorkflowView | null;
  relay: string;
  boardKey: string | null;
  columnId: string | null;
}): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: {
      label: issue.subject,
      className: 'web-button web-button--link roadmap-issue-title',
      stopPropagation: true,
      action: openIssueAction({
        issue,
        workflow,
        relay,
        boardKey,
        columnId,
        focus: 'activity',
      }),
    },
    children: [textNode(issue.subject)],
  };
}

function issueDetailsContent(
  issue: IssueView,
  showProject: boolean,
  relay: string,
  boardKey: string | null,
  workflow: WorkflowView | null,
  columnId: string | null,
): WebNode {
  const labels = issue.labels.slice(0, 4);

  const description = issueDescriptionPreview({
    issue,
    workflow,
    relay,
    boardKey,
    columnId,
  });

  return {
    type: 'element',
    tag: 'stack',
    props: { gap: 'xs', className: 'roadmap-issue-details' },
    children: [
      {
        type: 'element',
        tag: 'row',
        props: { gap: 'xs', className: 'roadmap-badges' },
        children: [
          ...(showProject ? [badge(issue.project, 'info')] : []),
          ...labels.map((label) =>
            badge(
              label,
              'muted',
              `roadmap-label-badge roadmap-label-badge-${classSuffix(label)}`,
              filterByLabelAction(label),
            ),
          ),
        ],
      },
      ...(description ? [description] : []),
      {
        type: 'element',
        tag: 'row',
        props: { gap: 'xs', className: 'roadmap-readable-muted' },
        children: [
          {
            type: 'element',
            tag: 'button',
            props: {
              label: `${issue.zapCount} zap${issue.zapCount === 1 ? '' : 's'}`,
              className: 'web-button web-button--link roadmap-meta-action',
              stopPropagation: true,
              action: fundIssueAction(issue, relay),
            },
          },
          textNode('·'),
          {
            type: 'element',
            tag: 'button',
            props: {
              label: `${issue.commentCount} comment${issue.commentCount === 1 ? '' : 's'}`,
              className: 'web-button web-button--link roadmap-meta-action',
              stopPropagation: true,
              action: openIssueAction({
                issue,
                workflow,
                relay,
                boardKey,
                columnId,
                focus: 'comments',
              }),
            },
          },
          textNode('·'),
          {
            type: 'element',
            tag: 'button',
            props: {
              label: formatSats(issue.fundingSats),
              className: 'roadmap-money-button',
              action: fundIssueAction(issue, relay),
            },
          },
        ],
      },
    ],
  };
}

function issueContent(
  issue: IssueView,
  showProject: boolean,
  relay: string,
  boardKey: string | null,
  workflow: WorkflowView | null,
  columnId: string | null,
): WebNode {
  return {
    type: 'element',
    tag: 'stack',
    props: { gap: 'xs' },
    children: [
      issueTitleButton({ issue, workflow, relay, boardKey, columnId }),
      issueDetailsContent(
        issue,
        showProject,
        relay,
        boardKey,
        workflow,
        columnId,
      ),
    ],
  };
}

function boardRefreshAction(
  relay: string,
  boardKey: string | null,
): Extract<WebAction, { type: 'clientAction' }>['refresh'] {
  if (!boardKey) {
    return undefined;
  }

  return {
    command: 'roadmap',
    subcommand: 'board',
    arguments: { id: boardKey },
    options: { relay },
  };
}

function issueCommentForm(
  issue: IssueView,
  workflow: RoadmapWorkflowPayload | null,
  relay: string,
  boardKey: string | null,
  columnId: string | null,
): WebNode {
  return {
    type: 'element',
    tag: 'form',
    props: {
      className: 'web-form web-form--stacked roadmap-comments-panel',
      action: {
        type: 'clientAction',
        action: 'roadmap.commentIssue',
        payload: {
          issueId: issue.id,
          issueAuthor: issue.authorPubkey,
          repo: issue.projectAddress,
          relay,
          relays: issue.repoRelays,
          title: issue.subject,
          modalIssue: issue,
          modalWorkflow: workflow,
          modalBoardKey: boardKey,
          modalColumnId: columnId,
        },
        ...(boardRefreshAction(relay, boardKey)
          ? { refresh: boardRefreshAction(relay, boardKey) }
          : {}),
      },
    },
    children: [
      ...(issue.comments.length > 0
        ? [
            {
              type: 'element' as const,
              tag: 'stack' as const,
              props: { gap: 'xs' as const },
              children: issue.comments.map((comment) => ({
                type: 'element' as const,
                tag: 'stack' as const,
                props: {
                  gap: 'xs' as const,
                  className: 'roadmap-comment-item',
                },
                children: [
                  readableMuted(
                    `${comment.authorPubkey.slice(0, 8)} · ${formatDate(comment.createdAt)}`,
                  ),
                  {
                    type: 'element' as const,
                    tag: 'text' as const,
                    props: { whiteSpace: 'pre-wrap' as const },
                    children: [textNode(comment.content)],
                  },
                ],
              })),
            },
          ]
        : [textBlock('No comments yet.', 'muted')]),
      {
        type: 'element',
        tag: 'textArea',
        props: {
          formFieldName: 'comment',
          inputPlaceholder: 'Write a comment',
          autoFocus: true,
          maxRows: 6,
        },
      },
      row(
        [
          {
            type: 'element',
            tag: 'button',
            props: { label: 'Send comment', htmlType: 'submit' },
          },
        ],
        'sm',
      ),
    ],
  };
}

function statusKindForIssue(issue: IssueView): string {
  if (issue.status === 'resolved') {
    return '1631';
  }

  if (issue.status === 'closed') {
    return '1632';
  }

  if (issue.status === 'draft') {
    return '1633';
  }

  return '1630';
}

function issueMarkForm({
  issue,
  workflow,
  relay,
  boardKey,
  columnId,
}: {
  issue: RoadmapIssuePayload;
  workflow: RoadmapWorkflowPayload | null;
  relay: string;
  boardKey: string | null;
  columnId: string | null;
}): WebNode {
  return {
    type: 'element',
    tag: 'form',
    props: {
      className: 'web-form roadmap-mark-row',
      action: {
        type: 'clientAction',
        action: 'roadmap.markIssue',
        payload: {
          issueId: issue.id,
          issueAuthor: issue.authorPubkey,
          repo: issue.projectAddress,
          repoMaintainers: issue.repoMaintainers,
          relay,
          relays: issue.repoRelays,
          title: issue.subject,
          modalIssue: issue,
          modalWorkflow: workflow,
          modalBoardKey: boardKey,
          modalColumnId: columnId,
        },
      },
    },
    children: [
      readableMuted('Mark as'),
      {
        type: 'element',
        tag: 'select',
        props: {
          formFieldName: 'statusKind',
          value: statusKindForIssue(issue),
          choices: ['1630', '1631', '1632', '1633'],
          choiceLabels: {
            '1630': 'Open',
            '1631': 'Resolved',
            '1632': 'Closed',
            '1633': 'Draft',
          },
        },
      },
      {
        type: 'element',
        tag: 'button',
        props: { label: 'OK', htmlType: 'submit' },
      },
    ],
  };
}

function issueTrackerForm({
  issue,
  workflow,
  relay,
  boardKey,
  columnId,
}: {
  issue: RoadmapIssuePayload;
  workflow: RoadmapWorkflowPayload;
  relay: string;
  boardKey: string | null;
  columnId: string | null;
}): WebNode {
  return {
    type: 'element',
    tag: 'form',
    props: {
      className: 'web-form roadmap-mark-row',
      action: {
        type: 'clientAction',
        action: 'roadmap.trackIssue',
        payload: {
          issueId: issue.id,
          issueAuthor: issue.authorPubkey,
          repo: issue.projectAddress,
          workflow: workflow.address,
          workflowAuthor: workflow.authorPubkey,
          relay,
          relays: workflow.repoRelays,
          title: issue.subject,
          modalIssue: issue,
          modalWorkflow: workflow,
          modalBoardKey: boardKey,
        },
      },
    },
    children: [
      readableMuted('Move to'),
      {
        type: 'element',
        tag: 'select',
        props: {
          formFieldName: 'columnId',
          value: columnId ?? 'pending',
          choices: workflow.columns.map((column) => column.id),
          choiceLabels: Object.fromEntries(
            workflow.columns.map((column) => [column.id, column.label]),
          ),
        },
      },
      {
        type: 'element',
        tag: 'button',
        props: { label: 'Publish move', htmlType: 'submit' },
      },
    ],
  };
}

function issueStatusForm({
  issue,
  workflow,
  relay,
  boardKey,
  columnId,
}: {
  issue: RoadmapIssuePayload;
  workflow: RoadmapWorkflowPayload | null;
  relay: string;
  boardKey: string | null;
  columnId: string | null;
}): WebNode {
  return issueMarkForm({ issue, workflow, relay, boardKey, columnId });
}

export function renderRoadmapIssueModalWeb({
  issue,
  workflow,
  relay,
  boardKey,
  columnId,
  focus,
  availableSignerPubkeys = null,
}: {
  issue: RoadmapIssuePayload;
  workflow: RoadmapWorkflowPayload | null;
  relay: string;
  boardKey: string | null;
  columnId: string | null;
  focus: 'activity' | 'comments' | 'manage';
  availableSignerPubkeys?: string[] | null;
}): WebNodeRoot {
  const capabilities = roadmapCapabilities({
    issue,
    workflow,
    availableSignerPubkeys,
  });

  const manageChildren: WebNode[] = [];

  if (workflow && capabilities.canMove) {
    manageChildren.push(
      issueTrackerForm({
        issue,
        workflow,
        relay,
        boardKey,
        columnId,
      }),
    );
  }

  if (capabilities.canMark) {
    manageChildren.push(
      issueStatusForm({
        issue,
        workflow,
        relay,
        boardKey,
        columnId,
      }),
    );
  }

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'issue' },
    tree: stack(
      [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold', className: 'roadmap-section-title' },
          children: [textNode(issue.subject)],
        },
        metaBadges([
          issue.project,
          issue.status ?? 'open',
          formatSats(issue.fundingSats),
          `${issue.commentCount} comment${issue.commentCount === 1 ? '' : 's'}`,
        ]),
        ...(issue.content.trim().length > 0
          ? [issueDescription(issue.content)]
          : [textBlock('No description.', 'muted')]),
        ...(capabilities.canComment
          ? [issueCommentForm(issue, workflow, relay, boardKey, columnId)]
          : []),
        ...(manageChildren.length > 0
          ? [
              {
                type: 'element' as const,
                tag: 'stack' as const,
                props: {
                  gap: 'xs' as const,
                  className: 'roadmap-management-panel',
                  ...(focus === 'manage'
                    ? { scrollIntoViewOnMount: true as const }
                    : {}),
                },
                children: [
                  {
                    type: 'element' as const,
                    tag: 'text' as const,
                    props: { weight: 'bold' as const },
                    children: [textNode('Manage')],
                  },
                  readableMuted(
                    'Board owner controls publish signed Nostr events.',
                  ),
                  ...manageChildren,
                ],
              },
            ]
          : []),
      ],
      'md',
    ),
    stylesheets: [roadmapStylesheet],
  };
}

export function renderRoadmapNewIssueWeb({
  workflow,
  relay,
}: {
  workflow: RoadmapWorkflowPayload;
  relay: string;
}): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'new' },
    tree: stack(
      [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold', className: 'roadmap-section-title' },
          children: [textNode(`New issue for ${workflow.title}`)],
        },
        {
          type: 'element',
          tag: 'form',
          props: {
            className: 'web-form web-form--stacked',
            action: {
              type: 'clientAction',
              action: 'roadmap.createIssue',
              payload: {
                repo: workflow.projectAddress,
                repoOwner: workflow.authorPubkey,
                relay,
                relays: workflow.repoRelays,
              },
              refresh: {
                command: 'roadmap',
                subcommand: 'board',
                arguments: { id: workflow.key },
                options: { relay },
              },
            },
          },
          children: [
            {
              type: 'element',
              tag: 'select',
              props: {
                formFieldName: 'type',
                choices: ['feature', 'bug'],
                value: 'feature',
              },
            },
            {
              type: 'element',
              tag: 'textField',
              props: {
                formFieldName: 'title',
                inputPlaceholder: 'Short issue title',
                autoFocus: true,
              },
            },
            {
              type: 'element',
              tag: 'textArea',
              props: {
                formFieldName: 'description',
                inputPlaceholder:
                  'Describe the problem, feature, or expected outcome',
                maxRows: 8,
              },
            },
            row(
              [
                {
                  type: 'element',
                  tag: 'button',
                  props: { label: 'Create issue', htmlType: 'submit' },
                },
              ],
              'sm',
            ),
          ],
        },
      ],
      'md',
    ),
    stylesheets: [roadmapStylesheet],
  };
}

function columnRow(
  label: string,
  index: number,
  visible: boolean,
): WebElementNode {
  return {
    type: 'element',
    tag: 'row',
    props: { gap: 'sm', itemAlign: 'center' },
    children: [
      {
        type: 'element',
        tag: 'checkbox',
        props: {
          formFieldName: `columnEnabled${index}`,
          checked: visible,
          className: 'web-checkbox web-checkbox--retro',
        },
      },
      {
        type: 'element',
        tag: 'textField',
        props: {
          formFieldName: `columnLabel${index}`,
          inputPlaceholder: 'Column label',
          value: label,
        },
      },
    ],
  };
}

export function renderRoadmapNewWorkflowWeb({
  projects,
  relay,
  relays,
  initialRepoAuthor = '',
  initialRepoD = '',
}: {
  projects: RoadmapProjectPayload[];
  relay: string;
  relays: string[];
  initialRepoAuthor?: string;
  initialRepoD?: string;
}): WebNodeRoot {
  const fetchedProject = projects[0] ?? null;

  const publishRelays = fetchedProject
    ? [
        ...new Set([
          ...fetchedProject.repoRelays,
          ...fetchedProject.ownerWriteRelays,
        ]),
      ]
    : [];

  const columnRows = [
    ...DEFAULT_WORKFLOW_COLUMNS.map((label, index) =>
      columnRow(label, index, true),
    ),
    ...Array.from({ length: EXTRA_WORKFLOW_COLUMN_COUNT }, (_, offset) => {
      const index = DEFAULT_WORKFLOW_COLUMNS.length + offset;
      const rowNode = columnRow('', index, false);

      return {
        ...rowNode,
        props: {
          ...(rowNode.props ?? {}),
          revealId: 'roadmap-extra-columns',
          hiddenUntilRevealed: true as const,
        },
      };
    }),
  ];

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'new-board' },
    tree: stack(
      [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold', className: 'roadmap-section-title' },
          children: [textNode('New roadmap board')],
        },
        readableMuted(
          'The workflow event must be signed by the NIP-34 repo author. AppWeaver only treats it as authoritative when the signer matches the repo owner.',
        ),
        {
          type: 'element',
          tag: 'form',
          props: {
            className: 'web-form web-form--stacked',
            action: {
              type: 'clientAction',
              action: 'roadmap.createWorkflow',
              payload: {
                projects,
                relay,
                relays,
                columnCount:
                  DEFAULT_WORKFLOW_COLUMNS.length + EXTRA_WORKFLOW_COLUMN_COUNT,
              },
              refresh: {
                command: 'roadmap',
                subcommand: 'list',
                arguments: {},
                options: relay ? { relay } : {},
              },
            },
          },
          children: [
            readableMuted('Repo pubkey'),
            {
              type: 'element',
              tag: 'textField',
              props: {
                formFieldName: 'repoAuthor',
                inputPlaceholder: 'NIP-34 repo author pubkey',
                value: initialRepoAuthor,
                autoFocus: true,
              },
            },
            readableMuted('Repo keyword'),
            {
              type: 'element',
              tag: 'textField',
              props: {
                formFieldName: 'repoD',
                inputPlaceholder: 'NIP-34 repo d tag, e.g. appweaver',
                value: initialRepoD,
              },
            },
            row(
              [
                {
                  type: 'element',
                  tag: 'button',
                  props: {
                    label: 'Fetch',
                    htmlType: 'submit',
                    submitAction: {
                      type: 'clientAction',
                      action: 'roadmap.fetchWorkflowRepo',
                      payload: {
                        relay,
                        relays,
                        columnCount:
                          DEFAULT_WORKFLOW_COLUMNS.length +
                          EXTRA_WORKFLOW_COLUMN_COUNT,
                      },
                    },
                  },
                },
              ],
              'sm',
            ),
            readableMuted(
              'AppWeaver resolves this repo announcement, then publishes to its repo relays plus the repo owner NIP-65 write relays.',
            ),
            ...(fetchedProject
              ? [
                  {
                    type: 'element' as const,
                    tag: 'box' as const,
                    props: {
                      padding: 'sm' as const,
                      className: 'roadmap-card',
                    },
                    children: [
                      stack(
                        [
                          {
                            type: 'element' as const,
                            tag: 'text' as const,
                            props: { weight: 'bold' as const },
                            children: [textNode(fetchedProject.name)],
                          },
                          readableMuted(fetchedProject.address),
                          ...(fetchedProject.description
                            ? [readableMuted(fetchedProject.description)]
                            : []),
                          readableMuted(
                            `Publish relays: ${publishRelays.length > 0 ? publishRelays.join(', ') : '(none discovered)'}`,
                          ),
                        ],
                        'xs',
                      ),
                    ],
                  },
                ]
              : []),
            {
              type: 'element',
              tag: 'textField',
              props: {
                formFieldName: 'roadmapD',
                inputPlaceholder: 'Roadmap d; blank uses the repo d tag',
              },
            },
            {
              type: 'element',
              tag: 'textField',
              props: {
                formFieldName: 'title',
                inputPlaceholder: 'Roadmap title',
              },
            },
            {
              type: 'element',
              tag: 'textArea',
              props: {
                formFieldName: 'description',
                inputPlaceholder: 'Describe this roadmap board',
                maxRows: 5,
              },
            },
            readableMuted('Columns'),
            ...columnRows,
            {
              type: 'element',
              tag: 'button',
              props: {
                label: 'Add column',
                className: 'web-button web-button--link roadmap-meta-action',
                action: {
                  type: 'reveal',
                  targetId: 'roadmap-extra-columns',
                },
              },
            },
            row(
              [
                {
                  type: 'element',
                  tag: 'button',
                  props: { label: 'Create roadmap', htmlType: 'submit' },
                },
              ],
              'sm',
            ),
          ],
        },
      ],
      'md',
    ),
    stylesheets: [roadmapStylesheet],
  };
}

function issueCard(
  issue: IssueView,
  showProject: boolean,
  relay: string,
  boardKey: string | null,
  workflow: WorkflowView | null,
  columnId: string | null,
): WebNode {
  return {
    type: 'element',
    tag: 'box',
    props: { padding: 'md', className: 'roadmap-card' },
    children: [
      issueContent(issue, showProject, relay, boardKey, workflow, columnId),
    ],
  };
}

function issueList(
  issues: IssueView[],
  emptyLabel: string,
  options: {
    showProject: boolean;
    treeStatus: string | null;
    limit: number | null;
    relay: string;
    boardKey: string | null;
    workflow: WorkflowView | null;
    columnId: string | null;
  },
): WebNode[] {
  if (issues.length === 0) {
    return [textBlock(emptyLabel, 'muted')];
  }

  const visibleIssues =
    options.limit === null ? issues : issues.slice(0, options.limit);

  if (options.treeStatus === null) {
    return visibleIssues.map((issue) =>
      issueCard(
        issue,
        options.showProject,
        options.relay,
        options.boardKey,
        options.workflow,
        options.columnId,
      ),
    );
  }

  return visibleIssues.map((issue) => ({
    type: 'element' as const,
    tag: 'treeItem' as const,
    props: {
      id: issue.id,
      filterText: issueFilterText(issue, options.treeStatus ?? ''),
      filterName: issue.subject,
      filterPath: `${options.treeStatus}/${issue.subject}`,
      defaultExpanded: false,
      className: 'roadmap-issue-item',
    },
    summary: issueTitleButton({
      issue,
      workflow: options.workflow,
      relay: options.relay,
      boardKey: options.boardKey,
      columnId: options.columnId,
    }),
    children: [
      issueDetailsContent(
        issue,
        options.showProject,
        options.relay,
        options.boardKey,
        options.workflow,
        options.columnId,
      ),
    ],
  }));
}

type ColumnSummaryLabelProps = {
  label: string;
  count: number;
  limit: number | null;
};

function columnSummaryLabel({
  label,
  count,
  limit,
}: ColumnSummaryLabelProps): string {
  const suffix = limit !== null && count > limit ? ' (latest 5 items)' : '';

  return `${label} (${count})${suffix}`;
}

function workflowSection(workflow: WorkflowView, relay: string): WebNode {
  const issues = workflow.columns.flatMap((column) => column.issues);
  const openIssues = issues.filter((issue) => issue.status === null);
  const zapCount = issues.reduce((total, issue) => total + issue.zapCount, 0);
  const unassignedColumn = workflow.columns[0];
  const boardColumns = workflow.columns.slice(1);

  return {
    type: 'element',
    tag: 'stack',
    props: { gap: 'sm' },
    children: [
      {
        type: 'element',
        tag: 'box',
        props: { padding: 'md', className: 'roadmap-section' },
        children: [
          stack(
            [
              {
                type: 'element',
                tag: 'text',
                props: { weight: 'bold', className: 'roadmap-section-title' },
                children: [textNode(`Repo: ${workflow.projectName}`)],
              },
              metaBadges([
                `${openIssues.length} open issues`,
                `${zapCount} verified zap events`,
                relay,
              ]),
              readableMuted(
                "Issues are sorted by zapped amount. You can zap unsigned issues too. Zapping is signaling, it's not a contract.",
              ),
              {
                type: 'element' as const,
                tag: 'treeFilterStatus' as const,
                props: {
                  label: 'Use filter button to search existing issues.',
                  className: 'roadmap-readable-muted',
                },
              },
              ...(unassignedColumn
                ? [
                    {
                      type: 'element' as const,
                      tag: 'treeItem' as const,
                      props: {
                        id: `${workflow.key}:${unassignedColumn.id}`,
                        defaultExpanded: true,
                        filterText: `${unassignedColumn.label} ${unassignedColumn.id} status:${unassignedColumn.id}`,
                        filterName: unassignedColumn.label,
                        filterPath: unassignedColumn.id,
                        className: `roadmap-status roadmap-status-${classSuffix(unassignedColumn.id)}`,
                      },
                      summary: {
                        type: 'element' as const,
                        tag: 'text' as const,
                        props: { weight: 'semibold' as const },
                        children: [
                          textNode(
                            columnSummaryLabel({
                              label: unassignedColumn.label,
                              count: unassignedColumn.issues.length,
                              limit: null,
                            }),
                          ),
                        ],
                      },
                      children: issueList(
                        unassignedColumn.issues,
                        'No unassigned issues.',
                        {
                          showProject: false,
                          treeStatus: unassignedColumn.id,
                          limit: null,
                          relay,
                          boardKey: workflow.key,
                          workflow,
                          columnId: unassignedColumn.id,
                        },
                      ),
                    },
                  ]
                : []),
            ],
            'sm',
          ),
        ],
      },
      {
        type: 'element',
        tag: 'box',
        props: { padding: 'md', className: 'roadmap-section' },
        children: [
          stack(
            [
              {
                type: 'element' as const,
                tag: 'stack' as const,
                props: {
                  gap: 'xs' as const,
                  className: 'roadmap-board-summary',
                },
                children: [
                  {
                    type: 'element' as const,
                    tag: 'row' as const,
                    props: { className: 'roadmap-section-title-row' },
                    children: [
                      {
                        type: 'element' as const,
                        tag: 'text' as const,
                        props: {
                          weight: 'bold' as const,
                          className: 'roadmap-section-title',
                        },
                        children: [textNode(workflow.title)],
                      },
                      workflowAuthor(workflow),
                    ],
                  },
                ],
              },
              ...boardColumns.map((column) => ({
                type: 'element' as const,
                tag: 'treeItem' as const,
                props: {
                  id: `${workflow.key}:${column.id}`,
                  defaultExpanded: true,
                  filterText: `${column.label} ${column.id} status:${column.id}`,
                  filterName: column.label,
                  filterPath: column.id,
                  className: `roadmap-status roadmap-status-${classSuffix(column.id)}`,
                },
                summary: {
                  type: 'element' as const,
                  tag: 'text' as const,
                  props: { weight: 'semibold' as const },
                  children: [
                    textNode(
                      columnSummaryLabel({
                        label: column.label,
                        count: column.issues.length,
                        limit: ROADMAP_COLUMN_VISIBLE_LIMIT,
                      }),
                    ),
                  ],
                },
                children: issueList(
                  column.issues,
                  'No issues in this column.',
                  {
                    showProject: false,
                    treeStatus: column.id,
                    limit: ROADMAP_COLUMN_VISIBLE_LIMIT,
                    relay,
                    boardKey: workflow.key,
                    workflow,
                    columnId: column.id,
                  },
                ),
              })),
            ],
            'sm',
          ),
        ],
      },
      {
        type: 'element',
        tag: 'button',
        props: {
          label: 'New Issue',
          ui: 'toolbar-add',
          className: 'roadmap-new-issue-button',
          action: openNewIssueAction({ workflow, relay }),
        },
      },
    ],
  };
}

function workflowAuthor(workflow: WorkflowView): WebNode {
  return {
    type: 'element',
    tag: 'link',
    props: {
      href: workflow.author.href,
      external: true,
      tone: workflow.author.verified ? 'success' : 'muted',
      className: 'roadmap-board-author',
    },
    children: [textNode(workflow.author.label)],
  };
}

function workflowSummaryCard(workflow: WorkflowView, relay: string): WebNode {
  const issues = workflow.columns.flatMap((column) => column.issues);
  const pendingCount = workflow.columns[0]?.issues.length ?? 0;
  const funding = issues.reduce((total, issue) => total + issue.fundingSats, 0);

  return {
    type: 'element',
    tag: 'box',
    props: { padding: 'md', className: 'roadmap-card' },
    children: [
      {
        type: 'element',
        tag: 'row',
        props: { gap: 'md', className: 'roadmap-issue-head' },
        children: [
          {
            type: 'element',
            tag: 'stack',
            props: { gap: 'xs', className: 'roadmap-issue-main' },
            children: [
              {
                type: 'element',
                tag: 'text',
                props: { weight: 'bold' },
                children: [textNode(workflow.title)],
              },
              readableMuted(
                `${pendingCount} pending · ${issues.length} total issue${issues.length === 1 ? '' : 's'} · ${formatSats(funding)}`,
              ),
            ],
          },
          {
            type: 'element',
            tag: 'button',
            props: {
              label: 'Open',
              action: boardAction(workflow, relay),
            },
          },
        ],
      },
    ],
  };
}

export function renderRoadmapWeb(view: RoadmapView): WebNodeRoot {
  const isBoardMode = view.mode === 'board';
  const activeWorkflow = isBoardMode ? view.workflows[0] : undefined;

  const relaySummary =
    view.relays.length > 0 ? view.relays.join(', ') : view.relay;

  return {
    kind: 'ui',
    version: 1,
    meta: {
      command: 'roadmap',
      subcommand: isBoardMode ? 'board' : 'list',
      arguments:
        isBoardMode && activeWorkflow ? { id: activeWorkflow.key } : {},
      options: view.relay ? { relay: view.relay } : {},
    },
    tree: {
      type: 'element',
      tag: 'tree',
      props: {
        className: 'roadmap-layout',
        ...(isBoardMode
          ? {
              filterable: true as const,
              filterPlaceholder: 'Filter by title, description, status, label',
              filterIndexKey: `roadmap:${activeWorkflow?.key ?? 'overview'}`,
            }
          : {}),
        ...(activeWorkflow
          ? {
              toolbarActions: [
                {
                  label: 'New Issue',
                  icon: 'add' as const,
                  action: openNewIssueAction({
                    workflow: activeWorkflow,
                    relay: view.relay,
                  }),
                },
              ],
            }
          : !isBoardMode && view.projects.length > 0
            ? {
                toolbarActions: [
                  {
                    label: 'New Roadmap',
                    icon: 'add' as const,
                    action: openNewWorkflowAction(view),
                  },
                ],
              }
            : {}),
      },
      children: [
        stack(
          [
            ...(!isBoardMode
              ? [
                  {
                    type: 'element' as const,
                    tag: 'row' as const,
                    props: { gap: 'md' as const, className: 'roadmap-header' },
                    children: [
                      {
                        type: 'element' as const,
                        tag: 'stack' as const,
                        props: { gap: 'xs' as const },
                        children: [
                          {
                            type: 'element' as const,
                            tag: 'text' as const,
                            props: { weight: 'bold' as const },
                            children: [textNode('Public Roadmaps')],
                          },
                          readableMuted(
                            `${view.issueCount} issues · ${view.zapCount} verified zap events`,
                          ),
                          readableMuted(
                            relaySummary
                              ? `Relays: ${relaySummary}`
                              : 'Relays: none',
                          ),
                        ],
                      },
                    ],
                  },
                ]
              : []),
            ...(isBoardMode
              ? view.workflows.map((workflow) =>
                  workflowSection(workflow, view.relay),
                )
              : [
                  {
                    type: 'element' as const,
                    tag: 'box' as const,
                    props: {
                      padding: 'md' as const,
                      className: 'roadmap-section',
                    },
                    children: [
                      stack(
                        [
                          {
                            type: 'element' as const,
                            tag: 'text' as const,
                            props: { weight: 'bold' as const },
                            children: [textNode('Boards')],
                          },
                          ...view.workflows.map((workflow) =>
                            workflowSummaryCard(workflow, view.relay),
                          ),
                        ],
                        'sm',
                      ),
                    ],
                  },
                ]),
          ],
          'md',
        ),
      ],
    },
    stylesheets: [roadmapStylesheet],
  };
}

export function renderRoadmapFundWeb({
  issueId,
  title,
  sats,
  relay,
  relays,
}: {
  issueId: string;
  title: string;
  sats: number;
  relay: string;
  relays?: string[];
}): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'fund' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'md', className: 'roadmap-fund-modal' },
      children: [
        textBlock(
          'Funding is signaling, not a contract. Devs decide what to work on and when. Anyone can fund the same issue.',
          'warning',
        ),
        {
          type: 'element',
          tag: 'text',
          props: {
            weight: 'bold',
            tone: sats > 0 ? 'success' : 'muted',
            className: 'roadmap-money',
          },
          children: [textNode(formatSats(sats))],
        },
        {
          type: 'element',
          tag: 'form',
          props: {
            className: 'web-form web-form--stacked',
            action: {
              type: 'clientAction',
              action: 'roadmap.lightningZap',
              payload: { issueId, title, sats, relay, relays: relays ?? [] },
            },
          },
          children: [
            {
              type: 'element',
              tag: 'choiceField',
              props: {
                formFieldName: 'amount',
                choices: ['100', '1k', '5k', 'custom'],
                value: '100',
                customChoice: 'custom',
                inputPlaceholder: 'Custom amount in sats',
              },
            },
            {
              type: 'element',
              tag: 'textArea',
              props: {
                formFieldName: 'comment',
                inputPlaceholder: 'Optional comment',
                maxRows: 4,
              },
            },
            row(
              [
                {
                  type: 'element',
                  tag: 'checkbox',
                  props: { formFieldName: 'anonymous' },
                },
                textBlock('Zap anonymously', 'muted'),
              ],
              'xs',
            ),
            readableMuted(
              "Lightning and Cashu Nutzap payment execution is next. Cashu mint choices will come from the repo author's kind:10019 mint tags.",
            ),
            row(
              [
                {
                  type: 'element',
                  tag: 'button',
                  props: {
                    label: 'Lightning zap',
                    htmlType: 'submit',
                  },
                },
                {
                  type: 'element',
                  tag: 'button',
                  props: {
                    label: 'Cashu nutzap',
                    disabled: true,
                  },
                },
              ],
              'sm',
            ),
          ],
        },
      ],
    },
    stylesheets: [roadmapStylesheet],
  };
}
