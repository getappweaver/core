import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { createSignal } from 'solid-js';
import { z } from 'zod';

import { PROFILE_RELAYS_FOR_QUERY, uniqueRelays } from '@src/nostr/nip65';
import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';

import type { ChromeModalState } from '../chrome/types';

import { fetchUserWriteRelays, publishEvent } from './relayLists';

const ProfilePayloadSchema = z.object({
  pubkey: z.string().min(1),
  npub: z.string().nullable().default(null),
  name: z.string().nullable().default(null),
  username: z.string().nullable().default(null),
  picture: z.string().nullable().default(null),
  about: z.string().nullable().default(null),
  relayHints: z.array(z.string().min(1)).default([]),
  fallbackRelays: z
    .array(z.string().min(1))
    .default([...PROFILE_RELAYS_FOR_QUERY]),
});

type ProfilePayload = z.infer<typeof ProfilePayloadSchema>;

type ProfileActionDeps = {
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

type ContactListState = {
  event: NostrEvent | null;
  follows: Set<string>;
};

type ProfileMetadata = {
  name: string | null;
  username: string | null;
  picture: string | null;
  about: string | null;
};

export type WotFetchProfileResult = {
  type: 'wotFetchProfile';
  profile: string;
};

type FetchProfileMetadataProps = {
  pubkey: string;
  relays: string[];
};

type MergeProfilePayloadProps = {
  payload: ProfilePayload;
  metadata: ProfileMetadata | null;
};

const followState = createSignal<Record<string, boolean>>({});
const getFollowState = followState[0];
const setFollowState = followState[1];

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

function firstNonEmpty(values: (string | null | undefined)[]): string | null {
  return (
    values.find((value) => value != null && value.trim().length > 0) ?? null
  );
}

function shortValue(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function npubForPubkey(pubkey: string): string | null {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return null;
  }
}

function nprofileForPayload(payload: ProfilePayload): string {
  return nip19.nprofileEncode({
    pubkey: payload.pubkey,
    relays: uniqueRelays([
      ...payload.relayHints,
      ...payload.fallbackRelays,
    ]).slice(0, 4),
  });
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseProfileMetadata(
  event: NostrEvent | null,
): ProfileMetadata | null {
  if (!event) {
    return null;
  }

  try {
    const parsed = JSON.parse(event.content) as Record<string, unknown>;

    return {
      name:
        nonEmptyString(parsed.display_name) ??
        nonEmptyString(parsed.displayName),
      username: nonEmptyString(parsed.name),
      picture: nonEmptyString(parsed.picture) ?? nonEmptyString(parsed.image),
      about: nonEmptyString(parsed.about),
    };
  } catch {
    return null;
  }
}

function mergeProfilePayload({
  payload,
  metadata,
}: MergeProfilePayloadProps): ProfilePayload {
  if (!metadata) {
    return payload;
  }

  return ProfilePayloadSchema.parse({
    ...payload,
    name: metadata.name ?? payload.name,
    username: metadata.username ?? payload.username,
    picture: metadata.picture ?? payload.picture,
    about: metadata.about ?? payload.about,
  });
}

async function fetchProfileMetadata({
  pubkey,
  relays,
}: FetchProfileMetadataProps): Promise<ProfileMetadata | null> {
  const pool = new SimplePool();
  const normalizedRelays = uniqueRelays(relays);

  try {
    const event = await pool.get(normalizedRelays, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });

    return parseProfileMetadata(event);
  } finally {
    pool.close(normalizedRelays);
  }
}

function profileAction(payload: ProfilePayload): WebAction {
  return {
    type: 'clientAction',
    action: 'nostr.openProfilePanel',
    payload,
  };
}

function followAction(
  payload: ProfilePayload,
  mode: 'follow' | 'unfollow',
): WebAction {
  return {
    type: 'clientAction',
    action: 'nostr.followProfile',
    payload: { ...payload, mode },
  };
}

function openNostrAction(nprofile: string): WebAction {
  return {
    type: 'clientAction',
    action: 'web.openUrl',
    payload: { url: `nostr://${nprofile}` },
  };
}

function copyNprofileAction(nprofile: string): WebAction {
  return {
    type: 'clientAction',
    action: 'web.copyText',
    payload: { text: nprofile },
  };
}

function profileRoot({
  payload,
  currentUserPubkey,
}: {
  payload: ProfilePayload;
  currentUserPubkey: string | null;
}): WebNodeRoot {
  const npub = payload.npub ?? npubForPubkey(payload.pubkey);
  const nprofile = nprofileForPayload(payload);

  const displayName =
    firstNonEmpty([
      payload.name,
      payload.username,
      shortValue(npub),
      shortValue(payload.pubkey),
    ]) ?? 'unknown';

  const username = firstNonEmpty([payload.username, npub]);

  const followKey =
    `${currentUserPubkey ?? ''}:${payload.pubkey}`.toLowerCase();

  const isSelf =
    currentUserPubkey?.toLowerCase() === payload.pubkey.toLowerCase();

  const following = getFollowState()[followKey] === true;

  const buttons: WebNode[] = [];

  if (!isSelf) {
    buttons.push(
      el({
        tag: 'button',
        props: {
          label: following ? 'Unfollow' : 'Follow',
          tone: following ? 'muted' : 'success',
          action: followAction(payload, following ? 'unfollow' : 'follow'),
        },
        children: [],
      }),
    );
  }

  buttons.push(
    el({
      tag: 'button',
      props: { label: 'Open nostr://', action: openNostrAction(nprofile) },
      children: [],
    }),
    el({
      tag: 'button',
      props: { label: 'Copy nprofile1', action: copyNprofileAction(nprofile) },
      children: [],
    }),
  );

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nostr', subcommand: 'profile' },
    tree: el({
      tag: 'stack',
      props: { gap: 'md', className: 'web-nostrProfile' },
      children: [
        el({
          tag: 'row',
          props: { gap: 'sm', itemAlign: 'center' },
          children: [
            el({
              tag: 'image',
              props: {
                src: payload.picture ?? undefined,
                alt: '',
                className: 'web-nostrProfile__avatar',
              },
              children: [],
            }),
            el({
              tag: 'stack',
              props: { gap: 'xs', fill: true },
              children: [
                el({
                  tag: 'text',
                  props: {
                    weight: 'bold',
                    className: 'web-nostrProfile__name',
                  },
                  children: [text(displayName)],
                }),
                el({
                  tag: 'text',
                  props: {
                    tone: 'muted',
                    className: 'web-nostrProfile__handle',
                  },
                  children: [
                    text(
                      username
                        ? `@${username.replace(/^@/, '')}`
                        : shortValue(payload.pubkey),
                    ),
                  ],
                }),
              ],
            }),
          ],
        }),
        ...(payload.about
          ? [
              el({
                tag: 'text',
                props: {
                  whiteSpace: 'pre-wrap',
                  className: 'web-nostrProfile__about',
                },
                children: [text(payload.about)],
              }),
            ]
          : []),
        el({
          tag: 'text',
          props: { tone: 'muted', className: 'web-nostrProfile__npub' },
          children: [text(npub ?? payload.pubkey)],
        }),
        el({
          tag: 'row',
          props: { gap: 'xs', itemAlign: 'center' },
          children: buttons,
        }),
      ],
    }),
  };
}

async function fetchContactList({
  pubkey,
  relays,
}: {
  pubkey: string;
  relays: string[];
}): Promise<ContactListState> {
  const pool = new SimplePool();
  const normalizedRelays = uniqueRelays(relays);

  try {
    const event = await pool.get(normalizedRelays, {
      kinds: [3],
      authors: [pubkey],
      limit: 1,
    });

    return {
      event,
      follows: new Set(
        (event?.tags ?? [])
          .filter((tag) => tag[0] === 'p' && tag[1])
          .map((tag) => tag[1]!.toLowerCase()),
      ),
    };
  } finally {
    pool.close(normalizedRelays);
  }
}

function contactTags({
  existing,
  targetPubkey,
  mode,
  relayHint,
}: {
  existing: NostrEvent | null;
  targetPubkey: string;
  mode: 'follow' | 'unfollow';
  relayHint: string;
}): string[][] {
  const tags = (existing?.tags ?? []).filter((tag) => tag[0] !== 'p' || tag[1]);
  const target = targetPubkey.toLowerCase();

  const withoutTarget = tags.filter(
    (tag) => !(tag[0] === 'p' && tag[1]?.toLowerCase() === target),
  );

  if (mode === 'unfollow') {
    return withoutTarget;
  }

  return [...withoutTarget, ['p', targetPubkey, relayHint]];
}

export async function handleNostrOpenProfilePanelAction({
  action,
  currentUserPubkey,
  setChromeWeb,
  setChromeModal,
  setChromeText,
  setChromeError,
  setChromeLoading,
}: ProfileActionDeps): Promise<WotFetchProfileResult | void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  const payload = ProfilePayloadSchema.parse(action.payload ?? {});
  let renderedPayload = payload;
  let fetchedMetadata: ProfileMetadata | null = null;

  setChromeModal({
    command: 'nostr',
    subcommand: 'profile',
    title: 'Nostr profile',
  });

  try {
    fetchedMetadata = await fetchProfileMetadata({
      pubkey: payload.pubkey,
      relays: uniqueRelays([
        ...PROFILE_RELAYS_FOR_QUERY,
        ...payload.relayHints,
        ...payload.fallbackRelays,
      ]),
    });

    renderedPayload = mergeProfilePayload({
      payload,
      metadata: fetchedMetadata,
    });
  } catch {
    renderedPayload = payload;
  }

  setChromeWeb(profileRoot({ payload: renderedPayload, currentUserPubkey }));
  setChromeLoading(false);

  const fetchProfileResult = fetchedMetadata
    ? {
        type: 'wotFetchProfile' as const,
        profile: nprofileForPayload(renderedPayload),
      }
    : undefined;

  if (!currentUserPubkey) {
    return fetchProfileResult;
  }

  try {
    const contactList = await fetchContactList({
      pubkey: currentUserPubkey,
      relays: uniqueRelays([
        ...PROFILE_RELAYS_FOR_QUERY,
        ...renderedPayload.fallbackRelays,
      ]),
    });

    const followKey =
      `${currentUserPubkey}:${renderedPayload.pubkey}`.toLowerCase();

    setFollowState((current) => ({
      ...current,
      [followKey]: contactList.follows.has(
        renderedPayload.pubkey.toLowerCase(),
      ),
    }));

    setChromeWeb(profileRoot({ payload: renderedPayload, currentUserPubkey }));
  } catch {
    // The modal is still useful without live follow-state detection.
  } finally {
    setChromeLoading(false);
  }

  return fetchProfileResult;
}

export async function handleNostrFollowProfileAction({
  action,
  currentUserPubkey,
  signEvent,
  setChromeWeb,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: ProfileActionDeps): Promise<void> {
  setChromeLoading(true);
  setChromeError(null);

  try {
    const payload = ProfilePayloadSchema.extend({
      mode: z.enum(['follow', 'unfollow']),
    }).parse(action.payload ?? {});

    if (!currentUserPubkey) {
      throw new Error('Connect or unlock a Nostr signer to follow profiles.');
    }

    const fallbackRelays = uniqueRelays(payload.fallbackRelays);

    const lookupRelays = uniqueRelays([
      ...PROFILE_RELAYS_FOR_QUERY,
      ...fallbackRelays,
    ]);

    const { event: existing } = await fetchContactList({
      pubkey: currentUserPubkey,
      relays: lookupRelays,
    });

    const relayHint = uniqueRelays(payload.relayHints)[0] ?? '';

    const template: EventTemplate = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      content: existing?.content ?? '',
      tags: contactTags({
        existing,
        targetPubkey: payload.pubkey,
        mode: payload.mode,
        relayHint,
      }),
    };

    const signed = await signEvent(template, {
      title:
        payload.mode === 'follow'
          ? 'Follow Nostr profile'
          : 'Unfollow Nostr profile',
    });

    if (!signed) {
      throw new Error('Follow list update was not signed.');
    }

    const userWriteRelays = await fetchUserWriteRelays({
      pubkey: signed.pubkey,
      fallbackRelays,
    });

    const acceptedRelays = await publishEvent(userWriteRelays, signed);

    if (acceptedRelays.length === 0) {
      throw new Error('Follow list update failed on all relays.');
    }

    const followKey = `${signed.pubkey}:${payload.pubkey}`.toLowerCase();

    setFollowState((current) => ({
      ...current,
      [followKey]: payload.mode === 'follow',
    }));

    setChromeWeb(profileRoot({ payload, currentUserPubkey: signed.pubkey }));

    appendSystemMessage(
      payload.mode === 'follow' ? 'Followed profile' : 'Unfollowed profile',
    );
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}

export function buildNostrProfileActionPayload({
  pubkey,
  npub,
  name,
  username,
  picture,
  about,
  relayHints,
}: {
  pubkey: string;
  npub: string | null;
  name: string | null;
  username: string | null;
  picture: string | null;
  about: string | null;
  relayHints: string[];
}): ProfilePayload {
  return ProfilePayloadSchema.parse({
    pubkey,
    npub,
    name,
    username,
    picture,
    about,
    relayHints,
  });
}

export function buildNostrOpenProfileAction(
  payload: ProfilePayload,
): WebAction {
  return profileAction(payload);
}
