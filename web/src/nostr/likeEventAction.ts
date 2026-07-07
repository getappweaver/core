import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { PROFILE_RELAYS_FOR_QUERY, uniqueRelays } from '@src/nostr/nip65';
import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

import {
  markNostrInteraction,
  type NostrInteractionRecordResult,
} from './interactionState';
import {
  fetchAuthorReadRelays,
  fetchUserWriteRelays,
  publishEvent,
} from './relayLists';

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

    const relayHints = uniqueRelays(payload.relayHints);
    const relayHint = relayHints[0] ?? '';

    const tags = [
      ['e', payload.eventId, relayHint],
      ['p', payload.eventPubkey],
      ...(payload.eventKind ? [['k', String(payload.eventKind)]] : []),
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

    const fallbackRelays = uniqueRelays(payload.fallbackRelays);

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
      eventId: payload.eventId,
      kind: 'liked',
    });

    return {
      type: 'nostrInteractionRecord',
      nrAlias: payload.nrAlias,
      targetEventId: payload.eventId,
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
