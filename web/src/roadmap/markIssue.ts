import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { z } from 'zod';

import {
  renderRoadmapIssueModalWeb,
  type RoadmapIssuePayload,
  type RoadmapWorkflowPayload,
} from '@src/commands/roadmap/renderers/web';
import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

const ISSUE_KIND = 1621;
const DELETE_KIND = 5;
const TRACKER_KIND = 39011;

const STATUS_LABELS: Record<string, string> = {
  '1630': 'Open',
  '1631': 'Resolved',
  '1632': 'Closed',
  '1633': 'Draft',
};

const MarkIssuePayloadSchema = z.object({
  issueId: z.string().min(1),
  issueAuthor: z.string().min(1),
  repo: z.string().min(1),
  repoMaintainers: z.array(z.string()).optional(),
  relay: z.string().min(1),
  relays: z.array(z.string()).optional(),
  title: z.string().min(1),
  statusKind: z.enum(['1630', '1631', '1632', '1633']),
  modalIssue: z.unknown().optional(),
  modalWorkflow: z.unknown().nullable().optional(),
  modalBoardKey: z.string().nullable().optional(),
  modalColumnId: z.string().nullable().optional(),
});

const DeleteIssuePayloadSchema = z.object({
  issueId: z.string().min(1),
  issueAuthor: z.string().min(1),
  relay: z.string().min(1),
  relays: z.array(z.string()).optional(),
  title: z.string().min(1),
});

const TrackIssuePayloadSchema = z.object({
  issueId: z.string().min(1),
  issueAuthor: z.string().min(1),
  repo: z.string().min(1),
  workflow: z.string().min(1),
  workflowAuthor: z.string().min(1),
  relay: z.string().min(1),
  relays: z.array(z.string()).optional(),
  title: z.string().min(1),
  columnId: z.string().min(1),
  modalIssue: z.unknown().optional(),
  modalWorkflow: z.unknown().optional(),
  modalBoardKey: z.string().nullable().optional(),
});

type MarkIssueDeps = {
  action: Extract<WebAction, { type: 'clientAction' }>;
  currentUserPubkey: string | null;
  signEvent: (
    event: EventTemplate,
    options?: { title: string | null; allowedPubkeys?: string[] | null },
  ) => Promise<NostrEvent | null>;
  setChromeWeb: (root: WebNodeRoot | null) => void;
  setChromeText: (text: string | null) => void;
  setChromeError: (text: string | null) => void;
  setChromeLoading: (loading: boolean) => void;
  appendSystemMessage: (text: string) => void;
};

function parseRepoOwner(repoAddress: string): string {
  const [kind, pubkey] = repoAddress.split(':');

  return kind === '30617' ? (pubkey ?? '') : '';
}

function statusRoot(title: string, body: string): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'mark' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'md' },
      children: [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold' },
          children: [{ type: 'text', value: title }],
        },
        {
          type: 'element',
          tag: 'text',
          props: { whiteSpace: 'pre-wrap' },
          children: [{ type: 'text', value: body }],
        },
      ],
    },
  };
}

function publishEventToRelays(
  relays: string[],
  event: NostrEvent,
): Promise<void> {
  const pool = new SimplePool();
  const targets = [...new Set(relays.filter(Boolean))];

  return Promise.allSettled(pool.publish(targets, event))
    .then((results) => {
      const fulfilled = results.find((result) => result.status === 'fulfilled');

      if (!fulfilled) {
        const rejected = results.find((result) => result.status === 'rejected');

        throw new Error(
          rejected?.status === 'rejected'
            ? String(rejected.reason)
            : 'Publish failed on all relays.',
        );
      }
    })
    .finally(() => {
      pool.close(targets);
    });
}

function ensureCanMark(props: {
  currentUserPubkey: string | null;
  issueAuthor: string;
  repoOwner: string;
  repoMaintainers: string[];
}): void {
  const allowed = new Set([
    props.issueAuthor,
    props.repoOwner,
    ...props.repoMaintainers,
  ]);

  if (!props.currentUserPubkey || !allowed.has(props.currentUserPubkey)) {
    throw new Error(
      'Only the issue author or a repository maintainer can mark this issue.',
    );
  }
}

function statusValue(statusKind: string): RoadmapIssuePayload['status'] {
  if (statusKind === '1631') {
    return 'resolved';
  }

  if (statusKind === '1632') {
    return 'closed';
  }

  if (statusKind === '1633') {
    return 'draft';
  }

  return null;
}

function rerenderIssueModal(props: {
  setChromeWeb: (root: WebNodeRoot | null) => void;
  issue: unknown;
  workflow: unknown;
  relay: string;
  boardKey: string | null;
  columnId: string | null;
  status: RoadmapIssuePayload['status'] | undefined;
}): boolean {
  if (!props.issue || !props.workflow) {
    return false;
  }

  const issue = props.issue as RoadmapIssuePayload;

  props.setChromeWeb(
    renderRoadmapIssueModalWeb({
      issue: {
        ...issue,
        ...(props.status !== undefined ? { status: props.status } : {}),
      },
      workflow: props.workflow as RoadmapWorkflowPayload,
      relay: props.relay,
      boardKey: props.boardKey,
      columnId: props.columnId,
      focus: 'manage',
    }),
  );

  return true;
}

export async function handleRoadmapMarkIssue({
  action,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: MarkIssueDeps): Promise<void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = MarkIssuePayloadSchema.parse(action.payload ?? {});
    const repoOwner = parseRepoOwner(payload.repo);

    const template: EventTemplate = {
      kind: Number(payload.statusKind),
      created_at: Math.floor(Date.now() / 1000),
      content: '',
      tags: [
        ['e', payload.issueId, payload.relay, 'root'],
        ['p', repoOwner],
        ['p', payload.issueAuthor],
        ['a', payload.repo, payload.relay],
      ],
    };

    const allowedPubkeys = [
      payload.issueAuthor,
      repoOwner,
      ...(payload.repoMaintainers ?? []),
    ].filter(Boolean);

    const signed = await signEvent(template, {
      title: 'Mark roadmap issue',
      allowedPubkeys,
    });

    if (!signed) {
      throw new Error('Connect or unlock a Nostr signer to mark issues.');
    }

    ensureCanMark({
      currentUserPubkey: signed.pubkey,
      issueAuthor: payload.issueAuthor,
      repoOwner,
      repoMaintainers: payload.repoMaintainers ?? [],
    });

    const publishRelays = payload.relays?.length
      ? payload.relays
      : [payload.relay];

    await publishEventToRelays(publishRelays, signed);

    const label = STATUS_LABELS[payload.statusKind] ?? payload.statusKind;

    const renderedModal = rerenderIssueModal({
      setChromeWeb,
      issue: payload.modalIssue,
      workflow: payload.modalWorkflow,
      relay: payload.relay,
      boardKey: payload.modalBoardKey ?? null,
      columnId: payload.modalColumnId ?? null,
      status: statusValue(payload.statusKind),
    });

    if (!renderedModal) {
      setChromeWeb(
        statusRoot(
          'Issue marked',
          `${payload.title}\n\nStatus: ${label}\nEvent: ${signed.id}\nRelays: ${publishRelays.join(', ')}`,
        ),
      );
    }

    appendSystemMessage(`Marked roadmap issue as ${label}: ${payload.title}`);
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}

export async function handleRoadmapDeleteIssue({
  action,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: MarkIssueDeps): Promise<void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = DeleteIssuePayloadSchema.parse(action.payload ?? {});

    const template: EventTemplate = {
      kind: DELETE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      content: 'Roadmap issue deleted by author.',
      tags: [
        ['e', payload.issueId],
        ['k', String(ISSUE_KIND)],
      ],
    };

    const signed = await signEvent(template, {
      title: 'Delete roadmap issue',
      allowedPubkeys: [payload.issueAuthor],
    });

    if (!signed) {
      throw new Error('Connect or unlock a Nostr signer to delete issues.');
    }

    if (signed.pubkey !== payload.issueAuthor) {
      throw new Error(
        'Only the issue author can request deletion for this issue.',
      );
    }

    const publishRelays = payload.relays?.length
      ? payload.relays
      : [payload.relay];

    await publishEventToRelays(publishRelays, signed);

    setChromeWeb(
      statusRoot(
        'Deletion request published',
        `${payload.title}\n\nEvent: ${signed.id}\nRelays: ${publishRelays.join(', ')}`,
      ),
    );

    appendSystemMessage(
      `Requested deletion for roadmap issue: ${payload.title}`,
    );
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}

export async function handleRoadmapTrackIssue({
  action,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: MarkIssueDeps): Promise<void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = TrackIssuePayloadSchema.parse(action.payload ?? {});
    const trackerKey = `${payload.workflow.split(':').at(-1) ?? 'workflow'}:${payload.issueId}`;

    const template: EventTemplate = {
      kind: TRACKER_KIND,
      created_at: Math.floor(Date.now() / 1000),
      content: payload.columnId,
      tags: [
        ['d', trackerKey],
        ['e', payload.issueId, payload.relay, 'tracked_item'],
        ['a', payload.workflow, payload.relay, 'workflow'],
        ['a', payload.repo, payload.relay],
        ['p', payload.issueAuthor],
        ['rank', String(Date.now())],
      ],
    };

    const signed = await signEvent(template, {
      title: 'Move roadmap issue',
      allowedPubkeys: [payload.workflowAuthor],
    });

    if (!signed) {
      throw new Error(
        'Connect or unlock the board owner signer to move issues.',
      );
    }

    if (signed.pubkey !== payload.workflowAuthor) {
      throw new Error('Only the board owner can move issues.');
    }

    const publishRelays = payload.relays?.length
      ? payload.relays
      : [payload.relay];

    await publishEventToRelays(publishRelays, signed);

    const renderedModal = rerenderIssueModal({
      setChromeWeb,
      issue: payload.modalIssue,
      workflow: payload.modalWorkflow,
      relay: payload.relay,
      boardKey: payload.modalBoardKey ?? null,
      columnId: payload.columnId,
      status: undefined,
    });

    if (!renderedModal) {
      setChromeWeb(
        statusRoot(
          'Issue moved',
          `${payload.title}\n\nColumn: ${payload.columnId}\nEvent: ${signed.id}\nRelays: ${publishRelays.join(', ')}`,
        ),
      );
    }

    appendSystemMessage(
      `Moved roadmap issue to ${payload.columnId}: ${payload.title}`,
    );
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
