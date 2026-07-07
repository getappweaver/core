import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
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
});

const SendRepostPayloadSchema = RepostPayloadSchema.extend({
  content: z.string().default(''),
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
            el({
              tag: 'row',
              props: { className: 'web-form__actions' },
              children: [
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
  const [userWriteRelays, authorReadRelays] = await Promise.all([
    fetchUserWriteRelays({ pubkey: signed.pubkey, fallbackRelays }),
    fetchAuthorReadRelays({
      pubkey: payload.eventPubkey,
      relayHints,
      fallbackRelays,
    }),
  ]);

  return publishEvent(
    uniqueRelays([...userWriteRelays, ...authorReadRelays]),
    signed,
  );
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

    setChromeWeb(
      repostPanelRoot({
        payload: {
          ...payload,
          relayHints: uniqueRelays(payload.relayHints),
          fallbackRelays: uniqueRelays(payload.fallbackRelays),
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
    const payload = SendRepostPayloadSchema.parse(action.payload ?? {});
    const content = payload.content.trim();

    if (!currentUserPubkey) {
      throw new Error('Connect or unlock a Nostr signer to repost this note.');
    }

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
    };
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
