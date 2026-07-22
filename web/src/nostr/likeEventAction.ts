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

const LikeEventPayloadSchema = z.object({
  eventId: z.string().min(1),
  eventPubkey: z.string().min(1),
  eventKind: z.number().int().optional(),
  nrAlias: z.string().min(1).default('nr'),
  relayHints: z.array(z.string().min(1)).default([]),
  fallbackRelays: z
    .array(z.string().min(1))
    .default([...PROFILE_RELAYS_FOR_QUERY]),
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
    };
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
