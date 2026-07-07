import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { z } from 'zod';

import { PROFILE_RELAYS_FOR_QUERY, uniqueRelays } from '@src/nostr/nip65';
import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';

import type { ChromeModalState } from '../chrome/types';

import {
  markNostrInteraction,
  type NostrInteractionRecordResult,
} from './interactionState';
import {
  fetchAuthorReadRelays,
  fetchUserWriteRelays,
  publishEvent,
} from './relayLists';

const ReplyPayloadSchema = z.object({
  eventId: z.string().min(1),
  eventPubkey: z.string().min(1),
  eventKind: z.number().int().optional(),
  nrAlias: z.string().min(1).default('nr'),
  eventCreatedAt: z.number().int().nullable().default(null),
  eventContent: z.string().nullable().default(null),
  eventAuthorName: z.string().nullable().default(null),
  eventAuthorUsername: z.string().nullable().default(null),
  eventAuthorPicture: z.string().nullable().default(null),
  rootEventId: z.string().min(1).nullable().default(null),
  rootPubkey: z.string().min(1).nullable().default(null),
  relayHints: z.array(z.string().min(1)).default([]),
  fallbackRelays: z
    .array(z.string().min(1))
    .default([...PROFILE_RELAYS_FOR_QUERY]),
});

const SendReplyPayloadSchema = ReplyPayloadSchema.extend({
  content: z.string().default(''),
});

type ReplyDeps = {
  action: Extract<WebAction, { type: 'clientAction' }>;
  currentUserPubkey: string | null;
  signEvent: (
    event: EventTemplate,
    options: { title: string | null },
  ) => Promise<NostrEvent | null>;
  setChromeWeb: (root: WebNodeRoot | null) => void;
  setChromeModal: (state: ChromeModalState | null) => void;
  setChromeText: (text: string | null) => void;
  setChromeError: (text: string | null) => void;
  setChromeLoading: (loading: boolean) => void;
  appendSystemMessage: (text: string) => void;
};

function text(value: string): WebNode {
  return { type: 'text', value };
}

type WebElementTag = Extract<WebNode, { type: 'element' }>['tag'];

function el(
  tag: WebElementTag,
  props: Record<string, unknown>,
  children: WebNode[],
): WebNode {
  return { type: 'element', tag, props, children } as WebNode;
}

function statusRoot(title: string, body: string): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nostr', subcommand: 'reply' },
    tree: el('stack', { gap: 'md' }, [
      el('text', { weight: 'bold' }, [text(title)]),
      el('text', { whiteSpace: 'pre-wrap' }, [text(body)]),
    ]),
  };
}

function npubForPubkey(pubkey: string): string | undefined {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return undefined;
  }
}

type NostrPostView = {
  id: string;
  pubkey: string;
  createdAt: number | null;
  content: string;
  authorName: string | null;
  authorUsername: string | null;
  authorPicture: string | null;
};

function nostrPostNode({ post }: { post: NostrPostView }): WebNode {
  return el(
    'nostrPost',
    {
      size: 'sm',
      nostrEventId: post.id,
      nostrPubkey: post.pubkey,
      nostrNpub: npubForPubkey(post.pubkey),
      nostrAuthorName: post.authorName ?? undefined,
      nostrAuthorUsername: post.authorUsername ?? undefined,
      nostrAuthorPicture: post.authorPicture ?? undefined,
      nostrCreatedAt: post.createdAt ?? undefined,
      nostrContent: post.content,
      nostrPreviewImages: true,
      nostrShowActions: false,
    },
    [],
  );
}

function postViewFromReplyPayload(
  payload: z.infer<typeof ReplyPayloadSchema>,
): NostrPostView {
  return {
    id: payload.eventId,
    pubkey: payload.eventPubkey,
    createdAt: payload.eventCreatedAt,
    content: payload.eventContent ?? '',
    authorName: payload.eventAuthorName,
    authorUsername: payload.eventAuthorUsername,
    authorPicture: payload.eventAuthorPicture,
  };
}

function postViewFromEvent(event: NostrEvent): NostrPostView {
  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    content: event.content,
    authorName: null,
    authorUsername: null,
    authorPicture: null,
  };
}

async function fetchReplies({
  eventId,
  eventPubkey,
  relayHints,
  fallbackRelays,
}: {
  eventId: string;
  eventPubkey: string;
  relayHints: string[];
  fallbackRelays: string[];
}): Promise<NostrEvent[]> {
  const relays = await fetchAuthorReadRelays({
    pubkey: eventPubkey,
    relayHints,
    fallbackRelays,
  });

  const pool = new SimplePool();

  try {
    const replies = await pool.querySync(
      relays,
      { kinds: [1], '#e': [eventId], limit: 20 },
      { maxWait: 4_000 },
    );

    return replies.sort((a, b) => a.created_at - b.created_at);
  } finally {
    pool.close(relays);
  }
}

function replyTags(
  payload: z.infer<typeof SendReplyPayloadSchema>,
): string[][] {
  const relayHints = uniqueRelays(payload.relayHints);
  const relayHint = relayHints[0] ?? '';
  const rootId = payload.rootEventId ?? payload.eventId;
  const rootPubkey = payload.rootPubkey ?? payload.eventPubkey;
  const tags: string[][] = [];

  tags.push(['e', rootId, relayHint, 'root', rootPubkey]);

  if (rootId !== payload.eventId) {
    tags.push(['e', payload.eventId, relayHint, 'reply', payload.eventPubkey]);
  }

  for (const pubkey of [...new Set([rootPubkey, payload.eventPubkey])]) {
    tags.push(['p', pubkey]);
  }

  if (payload.eventKind) {
    tags.push(['k', String(payload.eventKind)]);
  }

  return tags;
}

function replyPanelRoot({
  payload,
  replies,
}: {
  payload: z.infer<typeof ReplyPayloadSchema>;
  replies: NostrEvent[];
}): WebNodeRoot {
  const action = {
    type: 'clientAction' as const,
    action: 'nostr.sendReply',
    payload,
  };

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nostr', subcommand: 'reply' },
    tree: el('stack', { gap: 'sm' }, [
      el('text', { tone: 'muted', size: 'sm' }, [text('Replying to')]),
      nostrPostNode({ post: postViewFromReplyPayload(payload) }),
      el('treeItem', { id: 'nostr-reply-compose', defaultExpanded: true }, [
        el(
          'form',
          {
            className: 'web-form web-form--stacked',
            action,
          },
          [
            el(
              'textArea',
              {
                formFieldName: 'content',
                inputPlaceholder: 'Write a reply...',
                value: '',
                maxRows: 10,
                autoFocus: true,
              },
              [],
            ),
            el('row', { className: 'web-form__actions' }, [
              el('button', { label: 'Send', htmlType: 'submit' }, []),
            ]),
          ],
        ),
      ]),
      el('treeItem', { id: 'nostr-reply-existing', defaultExpanded: true }, [
        el('text', { weight: 'semibold' }, [text('Existing replies')]),
        ...(replies.length === 0
          ? [
              el('text', { tone: 'muted', size: 'sm' }, [
                text('No replies found.'),
              ]),
            ]
          : replies.map((reply) =>
              nostrPostNode({ post: postViewFromEvent(reply) }),
            )),
      ]),
    ]),
  };
}

export async function handleNostrOpenReplyPanelAction({
  action,
  setChromeModal,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
}: ReplyDeps): Promise<NostrInteractionRecordResult | void> {
  setChromeModal({
    command: 'nostr',
    subcommand: 'reply',
    title: 'Reply to note',
  });

  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = ReplyPayloadSchema.parse(action.payload ?? {});
    const relayHints = uniqueRelays(payload.relayHints);
    const fallbackRelays = uniqueRelays(payload.fallbackRelays);

    const replies = await fetchReplies({
      eventId: payload.eventId,
      eventPubkey: payload.eventPubkey,
      relayHints,
      fallbackRelays,
    });

    setChromeWeb(
      replyPanelRoot({
        payload: { ...payload, relayHints, fallbackRelays },
        replies,
      }),
    );
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}

export async function handleNostrSendReplyAction({
  action,
  currentUserPubkey,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage: _appendSystemMessage,
}: ReplyDeps): Promise<NostrInteractionRecordResult | void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = SendReplyPayloadSchema.parse(action.payload ?? {});
    const content = payload.content.trim();

    if (!currentUserPubkey) {
      throw new Error('Connect or unlock a Nostr signer to reply.');
    }

    if (!content) {
      throw new Error('Reply cannot be empty.');
    }

    const relayHints = uniqueRelays(payload.relayHints);
    const fallbackRelays = uniqueRelays(payload.fallbackRelays);

    const template: EventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      content,
      tags: replyTags({ ...payload, relayHints, fallbackRelays, content }),
    };

    const signed = await signEvent(template, { title: 'Sign Nostr reply' });

    if (!signed) {
      throw new Error('Reply was not signed.');
    }

    const [userWriteRelays, authorReadRelays] = await Promise.all([
      fetchUserWriteRelays({ pubkey: signed.pubkey, fallbackRelays }),
      fetchAuthorReadRelays({
        pubkey: payload.eventPubkey,
        relayHints,
        fallbackRelays,
      }),
    ]);

    const relays = uniqueRelays([...userWriteRelays, ...authorReadRelays]);
    const acceptedRelays = await publishEvent(relays, signed);

    if (acceptedRelays.length === 0) {
      throw new Error('Reply publish failed on all relays.');
    }

    const nostrUrl = `nostr://${nip19.neventEncode({
      id: signed.id,
      relays: acceptedRelays.slice(0, 4),
    })}`;

    setChromeWeb(
      statusRoot(
        'Reply published',
        `${nostrUrl}\n\nRelays:\n${acceptedRelays.join('\n')}`,
      ),
    );

    markNostrInteraction({
      userPubkey: signed.pubkey,
      eventId: payload.eventId,
      kind: 'replied',
    });

    return {
      type: 'nostrInteractionRecord',
      nrAlias: payload.nrAlias,
      targetEventId: payload.eventId,
      interactionEventId: signed.id,
      userPubkey: signed.pubkey,
      interactionType: 'replied',
      interactionCreatedAt: signed.created_at,
    };
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
