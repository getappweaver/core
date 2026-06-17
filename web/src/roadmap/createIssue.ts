import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { z } from 'zod';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

const ISSUE_KIND = 1621;
const REPO_KIND = 30617;

const CreateIssuePayloadSchema = z.object({
  repo: z.string().min(1),
  repoOwner: z.string().optional(),
  relay: z.string().min(1),
  relays: z.array(z.string()).optional(),
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
});

type CreateIssueDeps = {
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
    meta: { command: 'roadmap', subcommand: 'new' },
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

function parseRepoOwner(repoAddress: string): string {
  const [kind, pubkey] = repoAddress.split(':');

  return kind === String(REPO_KIND) ? (pubkey ?? '') : '';
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

export async function handleRoadmapCreateIssue({
  action,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: CreateIssueDeps): Promise<void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = CreateIssuePayloadSchema.parse(action.payload ?? {});
    const repoOwner = payload.repoOwner || parseRepoOwner(payload.repo);
    const title = payload.title.trim();
    const description = payload.description?.trim() ?? '';
    const issueType = payload.type.trim().toLowerCase();

    if (!repoOwner) {
      throw new Error('Issue is missing a valid NIP-34 repository address.');
    }

    if (!title) {
      throw new Error('Issue title is required.');
    }

    const template: EventTemplate = {
      kind: ISSUE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      content: description,
      tags: [
        ['a', payload.repo, payload.relay],
        ['p', repoOwner],
        ['subject', title],
        ['t', issueType],
      ],
    };

    const signed = await signEvent(template, { title: 'Create roadmap issue' });

    if (!signed) {
      throw new Error('Connect or unlock a Nostr signer to create issues.');
    }

    const publishRelays = payload.relays?.length
      ? payload.relays
      : [payload.relay];

    await publishEvent(publishRelays, signed);

    setChromeWeb(
      statusRoot(
        'Issue published',
        `${title}\n\nEvent: ${signed.id}\nRelays: ${publishRelays.join(', ')}`,
      ),
    );

    appendSystemMessage(`Published roadmap issue: ${title}`);
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
