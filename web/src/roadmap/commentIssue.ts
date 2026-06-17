import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { z } from 'zod';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

const COMMENT_KIND = 1111;
const ISSUE_KIND = 1621;

const CommentIssuePayloadSchema = z.object({
  issueId: z.string().min(1),
  issueAuthor: z.string().min(1),
  repo: z.string().min(1),
  relay: z.string().min(1),
  relays: z.array(z.string()).optional(),
  title: z.string().min(1),
  comment: z.string().min(1),
});

type CommentIssueDeps = {
  action: Extract<WebAction, { type: 'clientAction' }>;
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

function statusRoot(title: string, body: string): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'comment' },
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

function publishEvent(relays: string[], event: NostrEvent): Promise<void> {
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

export async function handleRoadmapCommentIssue({
  action,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: CommentIssueDeps): Promise<void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = CommentIssuePayloadSchema.parse(action.payload ?? {});
    const comment = payload.comment.trim();

    if (!comment) {
      throw new Error('Comment is required.');
    }

    const template: EventTemplate = {
      kind: COMMENT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      content: comment,
      tags: [
        ['E', payload.issueId, payload.relay],
        ['K', String(ISSUE_KIND)],
        ['P', payload.issueAuthor],
        ['a', payload.repo, payload.relay],
      ],
    };

    const signed = await signEvent(template, {
      title: 'Comment on roadmap issue',
    });

    if (!signed) {
      throw new Error('Connect or unlock a Nostr signer to comment.');
    }

    const publishRelays = payload.relays?.length
      ? payload.relays
      : [payload.relay];

    await publishEvent(publishRelays, signed);

    setChromeWeb(
      statusRoot(
        'Comment published',
        `${payload.title}\n\nEvent: ${signed.id}\nRelays: ${publishRelays.join(', ')}`,
      ),
    );

    appendSystemMessage(`Published comment on: ${payload.title}`);
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
