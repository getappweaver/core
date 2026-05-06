import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

import type { IssueView, RoadmapView, WorkflowView } from '../handler';

const roadmapStylesheet = {
  id: 'roadmap-web',
  cssText: `
    .web-tree.roadmap-layout {
      gap: 0.85rem;
    }

    .web-row.roadmap-header {
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }


    .web-box.roadmap-card,
    .web-box.roadmap-section {
      background: color-mix(in srgb, var(--color-panel, #242424) 92%, transparent);
    }

    .web-stack.roadmap-board-summary {
      padding: 0.25rem 0.1rem 0.45rem;
    }

    .web-stack.roadmap-inline-new-wrap {
      padding-top: 5px;
    }

    .web-treeItem.roadmap-status {
      padding: 0.55rem 0.6rem;
      border-radius: var(--radius-md, 0.5rem);
      border: 1px solid color-mix(in srgb, var(--roadmap-status-color, #7c7c7c) 35%, transparent);
      background: color-mix(in srgb, var(--roadmap-status-color, #7c7c7c) 18%, var(--color-panel, #242424));
    }

    .web-treeItem.roadmap-status > .web-tree-item-summary {
      color: color-mix(in srgb, var(--roadmap-status-color, currentColor) 70%, var(--color-text, currentColor));
    }

    .web-treeItem.roadmap-status-pending { --roadmap-status-color: #f59e0b; }
    .web-treeItem.roadmap-status-unassigned { --roadmap-status-color: #f59e0b; }
    .web-treeItem.roadmap-status-next { --roadmap-status-color: #38bdf8; }
    .web-treeItem.roadmap-status-in-progress { --roadmap-status-color: #a78bfa; }
    .web-treeItem.roadmap-status-done { --roadmap-status-color: #22c55e; }
    .web-treeItem.roadmap-status-shipped { --roadmap-status-color: #22c55e; }
    .web-treeItem.roadmap-status-rejected { --roadmap-status-color: #ef4444; }
    .web-treeItem.roadmap-status-archived { --roadmap-status-color: #eab308; }
    .web-treeItem.roadmap-status-archive { --roadmap-status-color: #eab308; }

    .web-treeItem.roadmap-issue-item {
      padding: 0.38rem 0.25rem 0.38rem 0.65rem;
      border-left: 2px solid color-mix(in srgb, var(--color-accent, #60a5fa) 45%, transparent);
    }

    .web-treeItem.roadmap-issue-item > .web-tree-item-children {
      margin-top: 0.45rem;
      margin-left: 0.85rem;
    }

    .web-text.roadmap-description {
      display: block;
      padding: 0.1rem 0 0.15rem;
      color: color-mix(in srgb, var(--color-text, currentColor) 82%, var(--color-text-muted, currentColor));
    }

    .web-text.roadmap-readable-muted {
      color: color-mix(in srgb, var(--color-text, currentColor) 78%, var(--color-text-muted, currentColor));
      font-size: 0.86em;
    }

    .web-row.roadmap-meta-badges {
      flex-wrap: wrap;
    }

    .web-badge.roadmap-meta-badge,
    .web-badge.roadmap-label-badge {
      border-radius: 999px;
      color: var(--color-text, currentColor);
      background: color-mix(in srgb, var(--color-text, currentColor) 14%, var(--color-panel, #242424));
    }

    .web-badge.roadmap-label-badge {
      color: #fff;
      background: color-mix(in srgb, var(--color-accent, #60a5fa) 55%, #000);
      font-size: 0.68rem;
    }

    .web-row.roadmap-issue-head {
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .web-stack.roadmap-issue-main {
      min-width: 0;
      flex: 1;
    }

    .web-row.roadmap-badges {
      flex-wrap: wrap;
    }

    .web-text.roadmap-issue-title {
      overflow-wrap: anywhere;
      border-radius: 0.2rem;
      cursor: pointer;
      font-size: 1rem;
      transition: color 120ms ease, background 120ms ease;
    }

    .web-text.roadmap-section-title {
      font-family: monospace;
      font-size: 1.22rem;
      line-height: 1.2;
    }

    .web-text.roadmap-issue-title:hover {
      color: var(--color-accent, #60a5fa);
      background: color-mix(in srgb, var(--color-accent, #60a5fa) 13%, transparent);
    }

    .web-text.roadmap-money {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .web-stack.roadmap-fund-modal {
      padding-bottom: 0.75rem;
    }

    .web-button.roadmap-money-button {
      padding: 0.12rem 0.35rem;
      border-radius: 0.25rem;
      color: var(--color-success, currentColor);
      background: transparent;
      box-shadow: none;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .web-button.roadmap-money-button:hover {
      color: #000;
      background: var(--color-warning);
    }

  `,
} as const;

const ROADMAP_COLUMN_VISIBLE_LIMIT = 5;

function revealAddIssueAction(revealId: string): WebAction {
  return {
    type: 'reveal',
    targetId: revealId,
  };
}

function hideAddIssueAction(revealId: string): WebAction {
  return {
    type: 'hideReveal',
    targetId: revealId,
  };
}

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
    options: { title: issue.subject, sats: issue.fundingSats, relay },
    surface: 'modal',
    modalTitle: `Fund "${issue.subject}"`,
    recordInTimeline: false,
  };
}

function badge(
  label: string,
  tone: 'muted' | 'success' | 'warning' | 'info',
  className: string | null = null,
): WebNode {
  return {
    type: 'element',
    tag: 'badge',
    props: { label, tone, size: 'sm', ...(className ? { className } : {}) },
  };
}

function formatSats(value: number): string {
  return `${value.toLocaleString('en-US')} sats`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
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

function readableMuted(value: string): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: { whiteSpace: 'pre-wrap', className: 'roadmap-readable-muted' },
    children: [textNode(value)],
  };
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

function addIssueRevealId(workflow: WorkflowView): string {
  return `roadmap-new-issue-${classSuffix(workflow.key)}`;
}

function inlineIssueForm({
  workflow,
  relay,
  revealId,
}: {
  workflow: WorkflowView;
  relay: string;
  revealId: string;
}): WebNode {
  return {
    type: 'element',
    tag: 'stack',
    props: {
      revealId,
      hiddenUntilRevealed: true,
      gap: 'xs',
      className: 'roadmap-inline-new-wrap',
    },
    children: [
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
          revealId,
          hiddenUntilRevealed: true,
          action: {
            type: 'command',
            command: 'roadmap',
            subcommand: 'new',
            arguments: {
              repo: workflow.projectAddress,
              type: 'feature',
              title: '',
              description: '',
            },
            options: { relay },
            recordInTimeline: false,
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
              {
                type: 'element',
                tag: 'button',
                props: {
                  label: 'Close',
                  className: 'web-button',
                  action: hideAddIssueAction(revealId),
                },
              },
            ],
            'sm',
          ),
        ],
      },
    ],
  };
}

function issueFilterText(issue: IssueView, status: string): string {
  return [
    issue.subject,
    issue.content,
    issue.project,
    status,
    issue.status ?? '',
    ...issue.labels,
  ].join(' ');
}

function issueContent(
  issue: IssueView,
  showProject: boolean,
  relay: string,
): WebNode {
  const labels = issue.labels.slice(0, 4);

  return {
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
            props: { weight: 'bold', className: 'roadmap-issue-title' },
            children: [textNode(issue.subject)],
          },
          {
            type: 'element',
            tag: 'row',
            props: { gap: 'xs', className: 'roadmap-badges' },
            children: [
              ...(showProject ? [badge(issue.project, 'info')] : []),
              ...labels.map((label) =>
                badge(label, 'muted', 'roadmap-label-badge'),
              ),
            ],
          },
          readableMuted(
            `${issue.zapCount} zap${issue.zapCount === 1 ? '' : 's'} · ${issue.commentCount} comment${issue.commentCount === 1 ? '' : 's'} · #${shortId(issue.id)}`,
          ),
        ],
      },
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
  };
}

function issueCard(
  issue: IssueView,
  showProject: boolean,
  relay: string,
): WebNode {
  return {
    type: 'element',
    tag: 'box',
    props: { padding: 'md', className: 'roadmap-card' },
    children: [issueContent(issue, showProject, relay)],
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
  },
): WebNode[] {
  if (issues.length === 0) {
    return [textBlock(emptyLabel, 'muted')];
  }

  const visibleIssues =
    options.limit === null ? issues : issues.slice(0, options.limit);

  if (options.treeStatus === null) {
    return visibleIssues.map((issue) =>
      issueCard(issue, options.showProject, options.relay),
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
      toggleSelector: '.roadmap-issue-title',
    },
    summary: issueContent(issue, options.showProject, options.relay),
    children:
      issue.content.trim().length > 0 ? [issueDescription(issue.content)] : [],
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
  const revealId = addIssueRevealId(workflow);
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
                    tag: 'text' as const,
                    props: {
                      weight: 'bold' as const,
                      className: 'roadmap-section-title',
                    },
                    children: [textNode(workflow.title)],
                  },
                  readableMuted(
                    "Issues are sorted by zapped amount. Zapping is signaling, it's not a contract.",
                  ),
                  readableMuted('Use filter button to search existing issues.'),
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
                  },
                ),
              })),
            ],
            'sm',
          ),
        ],
      },
      inlineIssueForm({ workflow, relay, revealId }),
    ],
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

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'list' },
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
                  label: 'New issue',
                  icon: 'add' as const,
                  action: revealAddIssueAction(
                    addIssueRevealId(activeWorkflow),
                  ),
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
                            children: [textNode('Roadmap')],
                          },
                          readableMuted(
                            `${view.issueCount} issues · ${view.zapCount} verified zap events · ${view.relay}`,
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
}: {
  issueId: string;
  title: string;
  sats: number;
  relay: string;
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
              payload: { issueId, title, sats, relay },
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
