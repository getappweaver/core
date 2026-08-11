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
    actionCategory: z.literal('repost_quote'),
    targetAuthorPubkey: z.string().min(1).nullable().default(null),
    targetAuthorLabel: z.string().min(1).default('Target author'),
    candidateTopics: z.array(z.string()).default([]),
    allowRemember: z.boolean().default(true),
    mode: z.enum(['ask', 'always', 'never']).default('ask'),
    targetEventJson: z.string().nullable().default(null),
  })
  .nullable()
  .default(null);

const RepostPayloadSchema = z.object({
  eventId: z.string().min(1),
  eventPubkey: z.string().min(1),
  eventKind: z.number().int().default(1),
  nrAlias: z.string().min(1).default('nr'),
  eventCreatedAt: z.number().int().nullable().default(null),
  eventContent: z.string().nullable().default(null),
  eventAuthorName: z.string().nullable().default(null),
  eventAuthorUsername: z.string().nullable().default(null),
  eventAuthorPicture: z.string().nullable().default(null),
  eventRawJson: z.string().nullable().default(null),
  relayHints: z.array(z.string().min(1)).default([]),
  fallbackRelays: z
    .array(z.string().min(1))
    .default([...PROFILE_RELAYS_FOR_QUERY]),
  signalReview: SignalReviewPayloadSchema,
});

const SendRepostPayloadSchema = RepostPayloadSchema.extend({
  content: z.string().default(''),
  signal_outcome: z.enum(['create', 'without_signal']).optional(),
  signal_topics: z.union([z.string(), z.array(z.string())]).optional(),
  signal_author_pubkey: z.string().nullable().optional(),
  signal_remember: z.union([z.boolean(), z.string()]).optional(),
});

type RepostDeps = {
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

type NostrPostView = {
  id: string;
  pubkey: string;
  createdAt: number | null;
  content: string;
  authorName: string | null;
  authorUsername: string | null;
  authorPicture: string | null;
};

type RepostTemplateProps = {
  payload: z.infer<typeof SendRepostPayloadSchema>;
  content: string;
  relayHint: string;
  nevent: string;
};

type PublishRepostProps = {
  signed: NostrEvent;
  payload: z.infer<typeof SendRepostPayloadSchema>;
  relayHints: string[];
  fallbackRelays: string[];
};

type PanelRootProps = {
  payload: z.infer<typeof RepostPayloadSchema>;
};

function text(value: string): WebNode {
  return { type: 'text', value };
}

function el({
  tag,
  props,
  children,
}: {
  tag: Extract<WebNode, { type: 'element' }>['tag'];
  props: Record<string, unknown>;
  children: WebNode[];
}): WebNode {
  return { type: 'element', tag, props, children } as WebNode;
}

function npubForPubkey(pubkey: string): string | undefined {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return undefined;
  }
}

function neventForPayload(
  payload: z.infer<typeof RepostPayloadSchema>,
): string {
  const relays = uniqueRelays([
    ...payload.relayHints,
    ...payload.fallbackRelays,
  ]);

  return nip19.neventEncode({
    id: payload.eventId,
    author: payload.eventPubkey,
    kind: payload.eventKind,
    relays: relays.slice(0, 4),
  });
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
  return el({
    tag: 'row',
    props: { gap: 'xs', itemAlign: 'center' },
    children: [
      el({
        tag: 'checkbox',
        props: {
          formFieldName: fieldName,
          value,
          checked,
          className: 'web-checkbox--retro',
        },
        children: [],
      }),
      text(label),
    ],
  });
}

function signalReviewNodes(
  review: z.infer<typeof SignalReviewPayloadSchema>,
): WebNode[] {
  if (!review || review.mode !== 'ask') {
    return [];
  }

  return [
    el({
      tag: 'text',
      props: { weight: 'semibold', size: 'sm' },
      children: [text('Signal review')],
    }),
    el({
      tag: 'text',
      props: { weight: 'semibold', size: 'sm' },
      children: [text('Author')],
    }),
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
          el({
            tag: 'text',
            props: { tone: 'muted', size: 'sm' },
            children: [text('No cached author')],
          }),
        ]),
    el({
      tag: 'text',
      props: { weight: 'semibold', size: 'sm' },
      children: [text('Topics')],
    }),
    ...(review.candidateTopics.length > 0
      ? review.candidateTopics.map((topic) =>
          signalReviewCheckbox({
            fieldName: 'signal_topics',
            value: topic,
            label: topic,
            checked: true,
          }),
        )
      : [
          el({
            tag: 'text',
            props: { tone: 'muted', size: 'sm' },
            children: [text('No topics')],
          }),
        ]),
    ...(review.allowRemember
      ? [
          el({
            tag: 'divider',
            props: { className: 'web-form__section-divider' },
            children: [],
          }),
          signalReviewCheckbox({
            fieldName: 'signal_remember',
            value: 'true',
            label: "Don't ask again for Repost / Quote",
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
    meta: { command: 'nostr', subcommand: 'repost' },
    tree: el({
      tag: 'stack',
      props: { gap: 'md' },
      children: [
        el({
          tag: 'text',
          props: { weight: 'bold' },
          children: [text(title)],
        }),
        el({
          tag: 'text',
          props: { whiteSpace: 'pre-wrap' },
          children: [text(body)],
        }),
      ],
    }),
  };
}

function postViewFromPayload(
  payload: z.infer<typeof RepostPayloadSchema>,
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

function canonicalRepostPayload({
  payload,
  response,
}: {
  payload: z.infer<typeof RepostPayloadSchema>;
  response: NostrEventContextResponse;
}): z.infer<typeof RepostPayloadSchema> {
  return {
    ...payload,
    eventId: response.targetEvent.id,
    eventPubkey: response.targetEvent.pubkey,
    eventKind: response.targetEvent.kind,
    eventCreatedAt: response.targetEvent.created_at,
    eventContent: response.targetEvent.content,
    eventRawJson: JSON.stringify(response.targetEvent),
    relayHints: response.targetRelayHints,
  };
}

async function resolveRepostContext(
  payload: z.infer<typeof RepostPayloadSchema>,
): Promise<NostrEventContextResponse> {
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
    includeDirectReplies: false,
    replyLimit: 1,
  });
}

function nostrPostNode(post: NostrPostView): WebNode {
  return el({
    tag: 'nostrPost',
    props: {
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
    children: [],
  });
}

function signalTopics(
  value: z.infer<typeof SendRepostPayloadSchema>['signal_topics'],
): string[] {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }

  return typeof value === 'string' ? [value] : [];
}

function signalRemember(
  value: z.infer<typeof SendRepostPayloadSchema>['signal_remember'],
): boolean {
  return value === true || value === 'true' || value === '1';
}

function repostAfterRecordCommands({
  payload,
  isQuote,
}: {
  payload: z.infer<typeof SendRepostPayloadSchema>;
  isQuote: boolean;
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
        action_category: 'repost_quote',
        signal_type: isQuote ? 'quote' : 'repost',
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

function repostPanelRoot({ payload }: PanelRootProps): WebNodeRoot {
  const action = {
    type: 'clientAction' as const,
    action: 'nostr.sendRepostOrQuote',
    payload,
  };

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nostr', subcommand: 'repost' },
    tree: el({
      tag: 'stack',
      props: { gap: 'sm' },
      children: [
        el({
          tag: 'text',
          props: { tone: 'muted', size: 'sm' },
          children: [text('Repost or quote')],
        }),
        nostrPostNode(postViewFromPayload(payload)),
        el({
          tag: 'form',
          props: { className: 'web-form web-form--stacked', action },
          children: [
            el({
              tag: 'textArea',
              props: {
                formFieldName: 'content',
                inputPlaceholder:
                  'Leave empty to repost, or write text to quote post...',
                value: '',
                maxRows: 10,
                autoFocus: true,
              },
              children: [],
            }),
            el({
              tag: 'text',
              props: { tone: 'muted', size: 'sm' },
              children: [
                text('Empty sends a NIP-18 repost. Text sends a quote post.'),
              ],
            }),
            ...signalReviewNodes(payload.signalReview),
            el({
              tag: 'row',
              props: { className: 'web-form__actions', gap: 'xs' },
              children:
                payload.signalReview?.mode === 'ask'
                  ? [
                      el({
                        tag: 'button',
                        props: {
                          label: 'Create signal + send',
                          htmlType: 'submit',
                          submitAction: withSignalOutcome({
                            action,
                            outcome: 'create',
                          }),
                        },
                        children: [],
                      }),
                      el({
                        tag: 'button',
                        props: {
                          label: 'Send without signal',
                          htmlType: 'submit',
                          submitAction: withSignalOutcome({
                            action,
                            outcome: 'without_signal',
                          }),
                        },
                        children: [],
                      }),
                    ]
                  : [
                      el({
                        tag: 'button',
                        props: { label: 'Send', htmlType: 'submit' },
                        children: [],
                      }),
                    ],
            }),
          ],
        }),
      ],
    }),
  };
}

function quoteContent(content: string, nevent: string): string {
  if (
    /nostr:(?:note|nevent|naddr)1[023456789acdefghjklmnpqrstuvwxyz]+/i.test(
      content,
    )
  ) {
    return content;
  }

  return `${content}\n\nnostr:${nevent}`;
}

function eventTemplate({
  payload,
  content,
  relayHint,
  nevent,
}: RepostTemplateProps): EventTemplate {
  if (content.length > 0) {
    return {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      content: quoteContent(content, nevent),
      tags: [
        ['q', payload.eventId, relayHint, payload.eventPubkey],
        ['p', payload.eventPubkey],
      ],
    };
  }

  const isKindOne = payload.eventKind === 1;

  return {
    kind: isKindOne ? 6 : 16,
    created_at: Math.floor(Date.now() / 1000),
    content: payload.eventRawJson ?? '',
    tags: [
      ['e', payload.eventId, relayHint],
      ['p', payload.eventPubkey],
      ...(!isKindOne ? [['k', String(payload.eventKind)]] : []),
    ],
  };
}

async function publishRepost({
  signed,
  payload,
  relayHints,
  fallbackRelays,
}: PublishRepostProps): Promise<string[]> {
  const relayPlan = await resolveNostrInteractionRelays({
    signerPubkey: signed.pubkey,
    recipientPubkeys: [payload.eventPubkey],
    relayHints,
    fallbackRelays,
  });

  return publishEvent(relayPlan.publishRelays, signed);
}

export async function handleNostrOpenRepostPanelAction({
  action,
  setChromeModal,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
}: RepostDeps): Promise<NostrInteractionRecordResult | void> {
  setChromeModal({
    command: 'nostr',
    subcommand: 'repost',
    title: 'Repost or quote',
  });

  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = RepostPayloadSchema.parse(action.payload ?? {});
    const response = await resolveRepostContext(payload);
    const canonicalPayload = canonicalRepostPayload({ payload, response });

    setChromeWeb(
      repostPanelRoot({
        payload: {
          ...canonicalPayload,
          fallbackRelays: uniqueRelays(canonicalPayload.fallbackRelays),
        },
      }),
    );
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}

export async function handleNostrSendRepostOrQuoteAction({
  action,
  currentUserPubkey,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage: _appendSystemMessage,
}: RepostDeps): Promise<NostrInteractionRecordResult | void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const submittedPayload = SendRepostPayloadSchema.parse(
      action.payload ?? {},
    );

    const content = submittedPayload.content.trim();

    if (!currentUserPubkey) {
      throw new Error('Connect or unlock a Nostr signer to repost this note.');
    }

    const response = await resolveRepostContext(submittedPayload);

    const canonicalPayload = canonicalRepostPayload({
      payload: submittedPayload,
      response,
    });

    const payload = SendRepostPayloadSchema.parse({
      ...canonicalPayload,
      content,
    });

    const relayHints = uniqueRelays(payload.relayHints);
    const fallbackRelays = uniqueRelays(payload.fallbackRelays);
    const relayHint = relayHints[0] ?? fallbackRelays[0] ?? '';
    const nevent = neventForPayload({ ...payload, relayHints, fallbackRelays });
    const template = eventTemplate({ payload, content, relayHint, nevent });
    const isQuote = content.length > 0;

    const signed = await signEvent(template, {
      title: isQuote ? 'Sign Nostr quote post' : 'Sign Nostr repost',
    });

    if (!signed) {
      throw new Error(
        isQuote ? 'Quote post was not signed.' : 'Repost was not signed.',
      );
    }

    const acceptedRelays = await publishRepost({
      signed,
      payload,
      relayHints,
      fallbackRelays,
    });

    if (acceptedRelays.length === 0) {
      throw new Error(
        isQuote
          ? 'Quote publish failed on all relays.'
          : 'Repost publish failed on all relays.',
      );
    }

    const nostrUrl = `nostr://${nip19.neventEncode({
      id: signed.id,
      relays: acceptedRelays.slice(0, 4),
    })}`;

    setChromeWeb(
      statusRoot(
        isQuote ? 'Quote post published' : 'Repost published',
        `${nostrUrl}\n\nRelays:\n${acceptedRelays.join('\n')}`,
      ),
    );

    markNostrInteraction({
      userPubkey: signed.pubkey,
      eventId: payload.eventId,
      kind: isQuote ? 'quoted' : 'reposted',
    });

    return {
      type: 'nostrInteractionRecord',
      nrAlias: payload.nrAlias,
      targetEventId: payload.eventId,
      interactionEventId: signed.id,
      userPubkey: signed.pubkey,
      interactionType: isQuote ? 'quoted' : 'reposted',
      interactionCreatedAt: signed.created_at,
      afterRecordCommands: repostAfterRecordCommands({ payload, isQuote }),
    };
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
