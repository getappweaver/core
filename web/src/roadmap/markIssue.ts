import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { z } from 'zod';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

const ISSUE_KIND = 1621;
const DELETE_KIND = 5;

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
  title: z.string().min(1),
  statusKind: z.enum(['1630', '1631', '1632', '1633']),
});

const DeleteIssuePayloadSchema = z.object({
  issueId: z.string().min(1),
  issueAuthor: z.string().min(1),
  relay: z.string().min(1),
  title: z.string().min(1),
});

type MarkIssueDeps = {
  action: Extract<WebAction, { type: 'clientAction' }>;
  currentUserPubkey: string | null;
  signEvent: (event: EventTemplate) => Promise<NostrEvent | null>;
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

function publishEvent(relay: string, event: NostrEvent): Promise<void> {
  const pool = new SimplePool();

  return Promise.allSettled(pool.publish([relay], event))
    .then((results) => {
      const rejected = results.find((result) => result.status === 'rejected');

      if (rejected?.status === 'rejected') {
        throw new Error(String(rejected.reason));
      }
    })
    .finally(() => {
      pool.close([relay]);
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

export async function handleRoadmapMarkIssue({
  action,
  currentUserPubkey,
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

    ensureCanMark({
      currentUserPubkey,
      issueAuthor: payload.issueAuthor,
      repoOwner,
      repoMaintainers: payload.repoMaintainers ?? [],
    });

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

    const signed = await signEvent(template);

    if (!signed) {
      throw new Error('Connect or unlock a Nostr signer to mark issues.');
    }

    await publishEvent(payload.relay, signed);

    const label = STATUS_LABELS[payload.statusKind] ?? payload.statusKind;

    setChromeWeb(
      statusRoot(
        'Issue marked',
        `${payload.title}\n\nStatus: ${label}\nEvent: ${signed.id}\nRelay: ${payload.relay}`,
      ),
    );

    appendSystemMessage(`Marked roadmap issue as ${label}: ${payload.title}`);
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}

export async function handleRoadmapDeleteIssue({
  action,
  currentUserPubkey,
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

    if (currentUserPubkey !== payload.issueAuthor) {
      throw new Error(
        'Only the issue author can request deletion for this issue.',
      );
    }

    const template: EventTemplate = {
      kind: DELETE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      content: 'Roadmap issue deleted by author.',
      tags: [
        ['e', payload.issueId],
        ['k', String(ISSUE_KIND)],
      ],
    };

    const signed = await signEvent(template);

    if (!signed) {
      throw new Error('Connect or unlock a Nostr signer to delete issues.');
    }

    await publishEvent(payload.relay, signed);

    setChromeWeb(
      statusRoot(
        'Deletion request published',
        `${payload.title}\n\nEvent: ${signed.id}\nRelay: ${payload.relay}`,
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
