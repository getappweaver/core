import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { PROFILE_RELAYS_FOR_QUERY, uniqueRelays } from '@src/nostr/nip65';
import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

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
    actionCategory: z.literal('like'),
    targetAuthorPubkey: z.string().min(1).nullable().default(null),
    candidateTopics: z.array(z.string()).default([]),
    mode: z.enum(['ask', 'always', 'never']).default('ask'),
    targetEventJson: z.string().nullable().default(null),
  })
  .nullable()
  .default(null);

const LikeEventPayloadSchema = z.object({
  eventId: z.string().min(1),
  eventPubkey: z.string().min(1),
  eventKind: z.number().int().optional(),
  nrAlias: z.string().min(1).default('nr'),
  relayHints: z.array(z.string().min(1)).default([]),
  fallbackRelays: z
    .array(z.string().min(1))
    .default([...PROFILE_RELAYS_FOR_QUERY]),
  signalReview: SignalReviewPayloadSchema,
  signal_outcome: z.enum(['create', 'without_signal']).optional(),
  signal_topics: z.union([z.string(), z.array(z.string())]).optional(),
  signal_author_pubkey: z.string().nullable().optional(),
  signal_remember: z.union([z.boolean(), z.string()]).optional(),
});

type LikeEventDeps = {
  action: Extract<WebAction, { type: 'clientAction' }>;
  currentUserPubkey: string | null;
  signEvent: (
    event: EventTemplate,
    options: { title: string | null },
  ) => Promise<NostrEvent | null>;
  setChromeWeb: (root: WebNodeRoot | null) => void;
  setChromeText: (text: string | null) => void;
  setChromeError: (text: string | null) => void;
  setChromeLoading: (loading: boolean) => void;
  appendSystemMessage: (text: string) => void;
};

function signalTopics(
  value: z.infer<typeof LikeEventPayloadSchema>['signal_topics'],
): string[] {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }

  return typeof value === 'string' ? [value] : [];
}

function signalRemember(
  value: z.infer<typeof LikeEventPayloadSchema>['signal_remember'],
): boolean {
  return value === true || value === 'true' || value === '1';
}

function likeAfterRecordCommands({
  payload,
}: {
  payload: z.infer<typeof LikeEventPayloadSchema>;
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
        action_category: 'like',
        signal_type: 'like',
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

function statusRoot(title: string, body: string): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nostr', subcommand: 'like' },
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

export async function handleNostrLikeEventAction({
  action,
  currentUserPubkey,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage: _appendSystemMessage,
}: LikeEventDeps): Promise<NostrInteractionRecordResult | void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = LikeEventPayloadSchema.parse(action.payload ?? {});

    if (!currentUserPubkey) {
      throw new Error('Connect or unlock a Nostr signer to like this note.');
    }

    const fallbackRelays = uniqueRelays(payload.fallbackRelays);

    const context = await resolveNostrEventContext({
      eventId: payload.eventId,
      authorPubkey: payload.eventPubkey,
      address: null,
      targetEvent: null,
      relayHints: uniqueRelays(payload.relayHints),
      fallbackRelays,
      includeDirectReplies: false,
      replyLimit: 1,
    });

    const target = context.targetEvent;
    const relayHints = context.targetRelayHints;
    const relayHint = relayHints[0] ?? '';

    const tags = [
      ['e', target.id, relayHint],
      ['p', target.pubkey],
      ...(target.kind ? [['k', String(target.kind)]] : []),
    ];

    const template: EventTemplate = {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      content: '+',
      tags,
    };

    const signed = await signEvent(template, { title: 'Like Nostr note' });

    if (!signed) {
      throw new Error('Like was not signed.');
    }

    const relayPlan = await resolveNostrInteractionRelays({
      signerPubkey: signed.pubkey,
      recipientPubkeys: [target.pubkey],
      relayHints,
      fallbackRelays,
    });

    const acceptedRelays = await publishEvent(relayPlan.publishRelays, signed);

    if (acceptedRelays.length === 0) {
      throw new Error('Like publish failed on all relays.');
    }

    const nostrUrl = `nostr://${nip19.neventEncode({
      id: signed.id,
      relays: acceptedRelays.slice(0, 4),
    })}`;

    setChromeWeb(
      statusRoot(
        'Liked note',
        `${nostrUrl}\n\nRelays:\n${acceptedRelays.join('\n')}`,
      ),
    );

    markNostrInteraction({
      userPubkey: signed.pubkey,
      eventId: target.id,
      kind: 'liked',
    });

    return {
      type: 'nostrInteractionRecord',
      nrAlias: payload.nrAlias,
      targetEventId: target.id,
      interactionEventId: signed.id,
      userPubkey: signed.pubkey,
      interactionType: 'liked',
      interactionCreatedAt: signed.created_at,
      afterRecordCommands: likeAfterRecordCommands({ payload }),
    };
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
