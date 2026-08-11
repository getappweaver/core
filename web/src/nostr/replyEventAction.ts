import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { PROFILE_RELAYS_FOR_QUERY, uniqueRelays } from '@src/nostr/nip65';
import type { NostrEventContextResponse } from '@src/web/nostr-resolution-schema';
import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';

import type { ChromeModalState } from '../chrome/types';

import {
  resolveNostrEventContext,
  resolveNostrInteractionRelays,
} from './interactionResolution';
import {
  markNostrInteraction,
  type NostrInteractionRecordResult,
} from './interactionState';
import { publishEvent } from './relayLists';

const SignalReviewPayloadSchema = z
  .object({
    actionCategory: z.enum(['reply', 'repost_quote']),
    targetAuthorPubkey: z.string().min(1).nullable().default(null),
    targetAuthorLabel: z.string().min(1).default('Target author'),
    candidateTopics: z.array(z.string()).default([]),
    allowRemember: z.boolean().default(true),
    mode: z.enum(['ask', 'always', 'never']).default('ask'),
    targetEventJson: z.string().nullable().default(null),
  })
  .nullable()
  .default(null);

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
  eventRawJson: z.string().nullable().default(null),
  rootEventId: z.string().min(1).nullable().default(null),
  rootPubkey: z.string().min(1).nullable().default(null),
  relayHints: z.array(z.string().min(1)).default([]),
  fallbackRelays: z
    .array(z.string().min(1))
    .default([...PROFILE_RELAYS_FOR_QUERY]),
  signalReview: SignalReviewPayloadSchema,
});

const SendReplyPayloadSchema = ReplyPayloadSchema.extend({
  content: z.string().default(''),
  signal_outcome: z.enum(['create', 'without_signal']).optional(),
  signal_topics: z.union([z.string(), z.array(z.string())]).optional(),
  signal_author_pubkey: z.string().nullable().optional(),
  signal_remember: z.union([z.boolean(), z.string()]).optional(),
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

function signalReviewCheckbox({
  fieldName,
  value,
  label,
  checked,
}: {
  fieldName: string;
  value: string;
  label: string;
  checked: boolean;
}): WebNode {
  return el('row', { gap: 'xs', itemAlign: 'center' }, [
    el(
      'checkbox',
      {
        formFieldName: fieldName,
        value,
        checked,
        className: 'web-checkbox--retro',
      },
      [],
    ),
    text(label),
  ]);
}

function signalReviewNodes(
  review: z.infer<typeof SignalReviewPayloadSchema>,
): WebNode[] {
  if (!review || review.mode !== 'ask') {
    return [];
  }

  return [
    el('text', { weight: 'semibold', size: 'sm' }, [text('Signal review')]),
    el('text', { weight: 'semibold', size: 'sm' }, [text('Author')]),
    ...(review.targetAuthorPubkey
      ? [
          signalReviewCheckbox({
            fieldName: 'signal_author_pubkey',
            value: review.targetAuthorPubkey,
            label: review.targetAuthorLabel,
            checked: true,
          }),
        ]
      : [
          el('text', { tone: 'muted', size: 'sm' }, [text('No cached author')]),
        ]),
    el('text', { weight: 'semibold', size: 'sm' }, [text('Topics')]),
    ...(review.candidateTopics.length > 0
      ? review.candidateTopics.map((topic) =>
          signalReviewCheckbox({
            fieldName: 'signal_topics',
            value: topic,
            label: topic,
            checked: true,
          }),
        )
      : [el('text', { tone: 'muted', size: 'sm' }, [text('No topics')])]),
    ...(review.allowRemember
      ? [
          el('divider', { className: 'web-form__section-divider' }, []),
          signalReviewCheckbox({
            fieldName: 'signal_remember',
            value: 'true',
            label: "Don't ask again for Reply",
            checked: false,
          }),
        ]
      : []),
  ];
}

function withSignalOutcome({
  action,
  outcome,
}: {
  action: Extract<WebAction, { type: 'clientAction' }>;
  outcome: 'create' | 'without_signal';
}): Extract<WebAction, { type: 'clientAction' }> {
  return {
    ...action,
    payload: {
      ...(action.payload ?? {}),
      signal_outcome: outcome,
      signal_topics: [],
    },
  };
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

type ProfileMetadata = {
  name: string | null;
  username: string | null;
  picture: string | null;
};

type FetchedReplies = {
  replies: NostrEvent[];
  profiles: Map<string, ProfileMetadata>;
  threadContext: NostrEvent[];
};

function nostrPostNode({
  post,
  threadContext,
}: {
  post: NostrPostView;
  threadContext: NostrEvent[];
}): WebNode {
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
      nostrReplyContext: threadContext.map((event) => ({
        type: 'event' as const,
        id: event.id,
        pubkey: event.pubkey,
        kind: event.kind,
        npub: npubForPubkey(event.pubkey),
        createdAt: event.created_at,
        content: event.content,
        showActions: false,
      })),
      nostrShowReplyContext: threadContext.length > 0,
      nostrPreviewImages: true,
      nostrShowActions: false,
    },
    [],
  );
}

function postViewFromReplyPayload({
  payload,
  profiles,
}: {
  payload: z.infer<typeof ReplyPayloadSchema>;
  profiles: Map<string, ProfileMetadata>;
}): NostrPostView {
  const profile = profiles.get(payload.eventPubkey.toLowerCase());

  return {
    id: payload.eventId,
    pubkey: payload.eventPubkey,
    createdAt: payload.eventCreatedAt,
    content: payload.eventContent ?? '',
    authorName: profile?.name ?? payload.eventAuthorName,
    authorUsername: profile?.username ?? payload.eventAuthorUsername,
    authorPicture: profile?.picture ?? payload.eventAuthorPicture,
  };
}

function postViewFromEvent({
  event,
  profiles,
}: {
  event: NostrEvent;
  profiles: Map<string, ProfileMetadata>;
}): NostrPostView {
  const profile = profiles.get(event.pubkey.toLowerCase());

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    content: event.content,
    authorName: profile?.name ?? null,
    authorUsername: profile?.username ?? null,
    authorPicture: profile?.picture ?? null,
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseProfileMetadata(event: NostrEvent): ProfileMetadata | null {
  try {
    const parsed = JSON.parse(event.content) as Record<string, unknown>;

    return {
      name:
        nonEmptyString(parsed.display_name) ??
        nonEmptyString(parsed.displayName),
      username: nonEmptyString(parsed.name),
      picture: nonEmptyString(parsed.picture) ?? nonEmptyString(parsed.image),
    };
  } catch {
    return null;
  }
}

function fetchedRepliesFromContext(
  response: NostrEventContextResponse,
): FetchedReplies {
  const profiles = new Map<string, ProfileMetadata>();

  for (const profileEvent of response.profileEvents) {
    const profile = parseProfileMetadata(profileEvent);

    if (profile) {
      profiles.set(profileEvent.pubkey.toLowerCase(), profile);
    }
  }

  const eventsById = new Map(
    response.graph.events.map((event) => [event.id, event]),
  );

  const threadContext = response.graph.edges.flatMap((edge) => {
    if (
      edge.sourceEventId !== response.targetEvent.id ||
      (edge.role !== 'thread-root' && edge.role !== 'thread-parent') ||
      edge.target.type !== 'event'
    ) {
      return [];
    }

    const event = eventsById.get(edge.target.eventId);

    return event ? [event] : [];
  });

  return {
    replies: response.directReplies,
    profiles,
    threadContext: [
      ...new Map(threadContext.map((event) => [event.id, event])).values(),
    ],
  };
}

function canonicalReplyPayload({
  payload,
  response,
}: {
  payload: z.infer<typeof ReplyPayloadSchema>;
  response: NostrEventContextResponse;
}): z.infer<typeof ReplyPayloadSchema> {
  const rootEdge = response.graph.edges.find(
    (edge) =>
      edge.sourceEventId === response.targetEvent.id &&
      edge.role === 'thread-root' &&
      edge.target.type === 'event',
  );

  return {
    ...payload,
    eventId: response.targetEvent.id,
    eventPubkey: response.targetEvent.pubkey,
    eventKind: response.targetEvent.kind,
    eventCreatedAt: response.targetEvent.created_at,
    eventContent: response.targetEvent.content,
    eventRawJson: JSON.stringify(response.targetEvent),
    rootEventId:
      rootEdge?.target.type === 'event'
        ? rootEdge.target.eventId
        : response.targetEvent.id,
    rootPubkey:
      rootEdge?.target.type === 'event'
        ? (rootEdge.target.authorPubkey ?? response.targetEvent.pubkey)
        : response.targetEvent.pubkey,
    relayHints: response.targetRelayHints,
  };
}

async function resolveReplyContext({
  payload,
  includeDirectReplies,
}: {
  payload: z.infer<typeof ReplyPayloadSchema>;
  includeDirectReplies: boolean;
}): Promise<NostrEventContextResponse> {
  const targetEvent = payload.eventRawJson
    ? (JSON.parse(payload.eventRawJson) as NostrEvent)
    : null;

  return resolveNostrEventContext({
    eventId: payload.eventId,
    authorPubkey: payload.eventPubkey,
    address: null,
    targetEvent,
    relayHints: uniqueRelays(payload.relayHints),
    fallbackRelays: uniqueRelays(payload.fallbackRelays),
    includeDirectReplies,
    replyLimit: 20,
  });
}

function profileLabel({
  pubkey,
  payload,
  profiles,
}: {
  pubkey: string;
  payload: z.infer<typeof ReplyPayloadSchema>;
  profiles: Map<string, ProfileMetadata>;
}): string {
  const profile = profiles.get(pubkey.toLowerCase());

  const isOriginalAuthor =
    pubkey.toLowerCase() === payload.eventPubkey.toLowerCase();

  return (
    profile?.name ??
    profile?.username ??
    (isOriginalAuthor
      ? (payload.eventAuthorName ?? payload.eventAuthorUsername)
      : null) ??
    npubForPubkey(pubkey)?.slice(0, 16) ??
    pubkey.slice(0, 16)
  );
}

function replyTargetPubkey({
  reply,
  payload,
  repliesById,
}: {
  reply: NostrEvent;
  payload: z.infer<typeof ReplyPayloadSchema>;
  repliesById: Map<string, NostrEvent>;
}): string {
  const eventTags = reply.tags.filter(
    (tag) => tag[0] === 'e' && tag[1] && tag[3] !== 'mention',
  );

  const targetTag =
    eventTags.findLast((tag) => tag[3] === 'reply') ??
    eventTags.findLast((tag) => !tag[3]) ??
    eventTags.find((tag) => tag[3] === 'root');

  if (!targetTag || targetTag[1] === payload.eventId) {
    return payload.eventPubkey;
  }

  return (
    targetTag[4] ??
    repliesById.get(targetTag[1]!)?.pubkey ??
    payload.eventPubkey
  );
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

function signalTopics(
  value: z.infer<typeof SendReplyPayloadSchema>['signal_topics'],
): string[] {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }

  return typeof value === 'string' ? [value] : [];
}

function signalRemember(
  value: z.infer<typeof SendReplyPayloadSchema>['signal_remember'],
): boolean {
  return value === true || value === 'true' || value === '1';
}

function replyAfterRecordCommands({
  payload,
}: {
  payload: z.infer<typeof SendReplyPayloadSchema>;
}): Array<Extract<WebAction, { type: 'command' }>> {
  const review = payload.signalReview;

  if (!review) {
    return [];
  }

  const outcome =
    review.mode === 'always'
      ? 'create'
      : review.mode === 'never'
        ? 'without_signal'
        : (payload.signal_outcome ?? 'without_signal');

  const remember =
    review.mode === 'ask' && signalRemember(payload.signal_remember);

  if (outcome === 'without_signal' && !remember) {
    return [];
  }

  return [
    {
      type: 'command',
      command: payload.nrAlias,
      subcommand: 'signal-record',
      arguments: {},
      options: {
        target_event_id: payload.eventId,
        action_category: 'reply',
        signal_type: 'reply',
        signal_outcome: outcome,
        signal_topics:
          outcome === 'create'
            ? review.mode === 'always'
              ? review.candidateTopics
              : signalTopics(payload.signal_topics)
            : [],
        signal_author_pubkey:
          outcome === 'create'
            ? review.mode === 'always'
              ? review.targetAuthorPubkey
              : (payload.signal_author_pubkey ?? null)
            : null,
        signal_remember: remember,
        target_event_json: review.targetEventJson,
        candidate_topics: review.candidateTopics,
      },
      recordInTimeline: false,
    },
  ];
}

function replyPanelRoot({
  payload,
  replies,
  profiles,
  threadContext,
}: {
  payload: z.infer<typeof ReplyPayloadSchema>;
  replies: NostrEvent[];
  profiles: Map<string, ProfileMetadata>;
  threadContext: NostrEvent[];
}): WebNodeRoot {
  const action = {
    type: 'clientAction' as const,
    action: 'nostr.sendReply',
    payload,
  };

  const repliesById = new Map(replies.map((reply) => [reply.id, reply]));

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nostr', subcommand: 'reply' },
    tree: el('stack', { gap: 'sm' }, [
      el('text', { tone: 'muted', size: 'sm' }, [text('Replying to')]),
      nostrPostNode({
        post: postViewFromReplyPayload({ payload, profiles }),
        threadContext,
      }),
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
            ...signalReviewNodes(payload.signalReview),
            el('row', { className: 'web-form__actions', gap: 'xs' }, [
              ...(payload.signalReview?.mode === 'ask'
                ? [
                    el(
                      'button',
                      {
                        label: 'Reply + create signal',
                        htmlType: 'submit',
                        submitAction: withSignalOutcome({
                          action,
                          outcome: 'create',
                        }),
                      },
                      [],
                    ),
                    el(
                      'button',
                      {
                        label: 'Reply without signal',
                        htmlType: 'submit',
                        submitAction: withSignalOutcome({
                          action,
                          outcome: 'without_signal',
                        }),
                      },
                      [],
                    ),
                  ]
                : [el('button', { label: 'Send', htmlType: 'submit' }, [])]),
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
          : replies.map((reply) => {
              const targetPubkey = replyTargetPubkey({
                reply,
                payload,
                repliesById,
              });

              return el('stack', { gap: 'xs' }, [
                el('text', { tone: 'muted', size: 'sm' }, [
                  text(
                    `${profileLabel({ pubkey: reply.pubkey, payload, profiles })} replied to ${profileLabel({ pubkey: targetPubkey, payload, profiles })}`,
                  ),
                ]),
                nostrPostNode({
                  post: postViewFromEvent({ event: reply, profiles }),
                  threadContext: [],
                }),
              ]);
            })),
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

    const response = await resolveReplyContext({
      payload,
      includeDirectReplies: true,
    });

    const canonicalPayload = canonicalReplyPayload({ payload, response });

    const { replies, profiles, threadContext } =
      fetchedRepliesFromContext(response);

    setChromeWeb(
      replyPanelRoot({
        payload: canonicalPayload,
        replies,
        profiles,
        threadContext,
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
    const submittedPayload = SendReplyPayloadSchema.parse(action.payload ?? {});
    const content = submittedPayload.content.trim();

    if (!currentUserPubkey) {
      throw new Error('Connect or unlock a Nostr signer to reply.');
    }

    if (!content) {
      throw new Error('Reply cannot be empty.');
    }

    const response = await resolveReplyContext({
      payload: submittedPayload,
      includeDirectReplies: false,
    });

    const canonicalPayload = canonicalReplyPayload({
      payload: submittedPayload,
      response,
    });

    const relayHints = uniqueRelays(canonicalPayload.relayHints);
    const fallbackRelays = uniqueRelays(canonicalPayload.fallbackRelays);

    const payload = SendReplyPayloadSchema.parse({
      ...canonicalPayload,
      content,
    });

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

    const relayPlan = await resolveNostrInteractionRelays({
      signerPubkey: signed.pubkey,
      recipientPubkeys: [
        ...new Set([
          payload.rootPubkey ?? payload.eventPubkey,
          payload.eventPubkey,
        ]),
      ],
      relayHints,
      fallbackRelays,
    });

    const acceptedRelays = await publishEvent(relayPlan.publishRelays, signed);

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
      afterRecordCommands: replyAfterRecordCommands({ payload }),
    };
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
