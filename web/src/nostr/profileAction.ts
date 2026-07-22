import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { createSignal } from 'solid-js';
import { z } from 'zod';

import type {
  EventReferenceEdge,
  EventReferenceTarget,
} from '@src/nostr/event-resolution-types';
import { PROFILE_RELAYS_FOR_QUERY, uniqueRelays } from '@src/nostr/nip65';
import {
  NostrProfilePostsRequestSchema,
  NostrProfilePostsResponseSchema,
  type NostrProfilePostsRequest,
  type NostrProfilePostsResponse,
} from '@src/web/nostr-resolution-schema';
import {
  openNostrShareAction,
  type NostrSharePrefixes,
} from '@src/web/nostr-share';
import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebNostrPostReference,
} from '@src/web/ui-schema';
import {
  WebNostrPostExtraActionSchema,
  type WebNostrPostExtraAction,
} from '@src/web/ui-schema';

import type { ChromeModalState } from '../chrome/types';
import { fetchJson, postJson } from '../utils';

import { fetchUserWriteRelays, publishEvent } from './relayLists';

const ProfilePayloadSchema = z.object({
  pubkey: z.string().min(1),
  npub: z.string().nullable().default(null),
  name: z.string().nullable().default(null),
  username: z.string().nullable().default(null),
  picture: z.string().nullable().default(null),
  about: z.string().nullable().default(null),
  tab: z.enum(['profile', 'latestPosts']).default('profile'),
  relayHints: z.array(z.string().min(1)).default([]),
  sharePrefixes: z.object({
    nevent: z.string().min(1),
    nprofile: z.string().min(1),
  }),
  profileActions: z.array(WebNostrPostExtraActionSchema).default([]),
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

type ProfileTab = ProfilePayload['tab'];

type LatestProfilePost = {
  id: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  content: string;
  event: NostrEvent;
  inlineProfiles: Record<string, InlineProfile>;
  replyContext: LatestProfilePostReference[];
  embeds: Record<string, WebNostrPostReference>;
};

type InlineProfile = {
  pubkey: string;
  npub: string | undefined;
  authorName: string | undefined;
  authorUsername: string | undefined;
  authorPicture: string | undefined;
  authorAbout: string | undefined;
  relayHints: string[];
};

type LatestProfilePostReference = {
  type: 'event';
  id: string;
  pubkey: string;
  kind: number;
  npub: string | undefined;
  authorName: string | undefined;
  authorUsername: string | undefined;
  authorPicture: string | undefined;
  authorAbout: string | undefined;
  relayHints: string[];
  createdAt: number;
  content: string;
  replyAction: WebAction;
  repostAction: WebAction;
  showActions: true;
  inlineProfiles: Record<string, InlineProfile>;
  embeddedReferences: WebNostrPostReference[];
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

type ProfileRootProps = {
  payload: ProfilePayload;
  currentUserPubkey: string | null;
  activeTab: ProfileTab;
  latestPosts: LatestProfilePost[] | null;
};

const FollowedByFollowsResponseSchema = z.object({
  ok: z.literal(true),
  available: z.boolean(),
  count: z.number().int().nonnegative().nullable(),
  pubkeys: z.array(z.string()),
});

type FetchLatestProfilePostsProps = {
  pubkey: string;
  profile: ProfilePayload;
};

type BuildNostrProfileActionPayloadProps = {
  pubkey: string;
  npub: string | null;
  name: string | null;
  username: string | null;
  picture: string | null;
  about: string | null;
  relayHints: string[];
  profileActions: WebNostrPostExtraAction[];
  sharePrefixes: NostrSharePrefixes;
};

type NostrPostNodeProps = {
  post: LatestProfilePost;
  profile: ProfilePayload;
  relayHints: string[];
};

type LatestProfilePostFromEventProps = {
  event: NostrEvent;
  viewedProfile: ProfilePayload;
  profileByPubkey: Map<string, ProfileMetadata>;
  graph: ProfilePostGraph;
  defaultRelayHints: string[];
};

type ProfilePostGraph = {
  eventsById: Map<string, NostrEvent>;
  eventsByAddress: Map<string, NostrEvent>;
  edgesBySource: Map<string, EventReferenceEdge[]>;
};

type ResolvedReferencesProps = {
  event: NostrEvent;
  viewedProfile: ProfilePayload;
  profileByPubkey: Map<string, ProfileMetadata>;
  graph: ProfilePostGraph;
  defaultRelayHints: string[];
  depth: number;
  visitedEventIds: Set<string>;
};

type BuildLatestProfilePostsProps = {
  response: NostrProfilePostsResponse;
  viewedProfile: ProfilePayload;
  profileByPubkey: Map<string, ProfileMetadata>;
  defaultRelayHints: string[];
};

type BuildProfilePostsRequestProps = {
  pubkey: string;
  profile: ProfilePayload;
};

type ReplyContextFromEventProps = {
  event: NostrEvent;
  viewedProfile: ProfilePayload;
  profileByPubkey: Map<string, ProfileMetadata>;
  relayHints: string[];
};

const followState = createSignal<Record<string, boolean>>({});
const getFollowState = followState[0];
const setFollowState = followState[1];

const followedByFollowsState = createSignal<Record<string, number | null>>({});

const getFollowedByFollowsState = followedByFollowsState[0];
const setFollowedByFollowsState = followedByFollowsState[1];
const NOSTR_REFERENCE_RE = /nostr:([a-z0-9]+)/gi;

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

async function fetchFollowedByFollowsCount(
  pubkey: string,
): Promise<number | null> {
  const response = FollowedByFollowsResponseSchema.parse(
    await fetchJson<unknown>(
      `/api/nostr/followed-by-follows?pubkey=${encodeURIComponent(pubkey)}`,
    ),
  );

  return response.available ? response.count : null;
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

function profileTabAction(payload: ProfilePayload, tab: ProfileTab): WebAction {
  return profileAction({ ...payload, tab });
}

function copyNprofileAction(nprofile: string): WebAction {
  return {
    type: 'clientAction',
    action: 'web.copyText',
    payload: { text: nprofile },
  };
}

function rootReferenceFromEvent(event: NostrEvent): {
  id: string | null;
  pubkey: string | null;
} {
  const rootTag = event.tags.find(
    (tag) => tag[0] === 'e' && tag[3] === 'root' && tag[1],
  );

  if (!rootTag) {
    return { id: null, pubkey: null };
  }

  return {
    id: rootTag[1] ?? null,
    pubkey:
      typeof rootTag[4] === 'string' && rootTag[4].trim().length > 0
        ? rootTag[4].trim()
        : null,
  };
}

function replyEventAction({
  event,
  profile,
  relayHints,
}: {
  event: NostrEvent;
  profile: ProfileMetadata | null;
  relayHints: string[];
}): WebAction {
  const root = rootReferenceFromEvent(event);

  return {
    type: 'clientAction',
    action: 'nostr.openReplyPanel',
    payload: {
      eventId: event.id,
      eventPubkey: event.pubkey,
      eventKind: event.kind,
      nrAlias: 'nr',
      eventCreatedAt: event.created_at,
      eventContent: event.content,
      eventAuthorName: profile?.name,
      eventAuthorUsername: profile?.username,
      eventAuthorPicture: profile?.picture,
      eventRawJson: JSON.stringify(event),
      rootEventId: root.id,
      rootPubkey: root.pubkey,
      relayHints,
    },
  };
}

function repostEventAction({
  event,
  profile,
  relayHints,
}: {
  event: NostrEvent;
  profile: ProfileMetadata | null;
  relayHints: string[];
}): WebAction {
  return {
    type: 'clientAction',
    action: 'nostr.openRepostPanel',
    payload: {
      eventId: event.id,
      eventPubkey: event.pubkey,
      eventKind: event.kind,
      nrAlias: 'nr',
      eventCreatedAt: event.created_at,
      eventContent: event.content,
      eventAuthorName: profile?.name,
      eventAuthorUsername: profile?.username,
      eventAuthorPicture: profile?.picture,
      eventRawJson: JSON.stringify(event),
      relayHints,
    },
  };
}

function eventProfileMetadata({
  event,
  viewedProfile,
  profileByPubkey,
}: {
  event: NostrEvent;
  viewedProfile: ProfilePayload;
  profileByPubkey: Map<string, ProfileMetadata>;
}): ProfileMetadata | null {
  if (event.pubkey.toLowerCase() === viewedProfile.pubkey.toLowerCase()) {
    return {
      name: viewedProfile.name,
      username: viewedProfile.username,
      picture: viewedProfile.picture,
      about: viewedProfile.about,
    };
  }

  return profileByPubkey.get(event.pubkey.toLowerCase()) ?? null;
}

function inlineProfileForPubkey({
  pubkey,
  profileByPubkey,
}: {
  pubkey: string;
  profileByPubkey: Map<string, ProfileMetadata>;
}): InlineProfile {
  const profile = profileByPubkey.get(pubkey.toLowerCase());

  return {
    pubkey,
    npub: npubForPubkey(pubkey) ?? undefined,
    authorName: profile?.name ?? undefined,
    authorUsername: profile?.username ?? undefined,
    authorPicture: profile?.picture ?? undefined,
    authorAbout: profile?.about ?? undefined,
    relayHints: [],
  };
}

function inlineProfilesFromEvent({
  event,
  profileByPubkey,
}: {
  event: NostrEvent;
  profileByPubkey: Map<string, ProfileMetadata>;
}): Record<string, InlineProfile> {
  const inlineProfiles: Record<string, InlineProfile> = {};

  for (const match of event.content.matchAll(/nostr:([a-z0-9]+)/gi)) {
    const token = match[0];

    try {
      const decoded = nip19.decode(match[1]!);

      const pubkey =
        decoded.type === 'npub'
          ? decoded.data
          : decoded.type === 'nprofile'
            ? decoded.data.pubkey
            : null;

      if (!pubkey) {
        continue;
      }

      inlineProfiles[token] = inlineProfileForPubkey({
        pubkey,
        profileByPubkey,
      });
    } catch {
      continue;
    }
  }

  return inlineProfiles;
}

function displayContentForEvent(event: NostrEvent): string {
  return event.content.replace(/#\[(\d+)\]/g, (token, indexText: string) => {
    const index = Number.parseInt(indexText, 10);
    const tag = event.tags[index];

    if (tag?.[0] !== 'p' || !tag[1]) {
      return token;
    }

    const npub = npubForPubkey(tag[1]);

    return npub ? `nostr:${npub}` : token;
  });
}

function addressReferencesForContent({
  content,
  viewedProfile,
  profileByPubkey,
}: {
  content: string;
  viewedProfile: ProfilePayload;
  profileByPubkey: Map<string, ProfileMetadata>;
}): WebNostrPostReference[] {
  const references = new Map<string, WebNostrPostReference>();

  for (const match of content.matchAll(NOSTR_REFERENCE_RE)) {
    try {
      const decoded = nip19.decode(match[1]!);

      if (decoded.type !== 'naddr') {
        continue;
      }

      const id = `${decoded.data.kind}:${decoded.data.pubkey}:${decoded.data.identifier}`;

      const profile =
        decoded.data.pubkey.toLowerCase() === viewedProfile.pubkey.toLowerCase()
          ? {
              name: viewedProfile.name,
              username: viewedProfile.username,
              picture: viewedProfile.picture,
              about: viewedProfile.about,
            }
          : profileByPubkey.get(decoded.data.pubkey.toLowerCase());

      references.set(id, {
        token: match[0],
        type: 'address',
        id,
        pubkey: decoded.data.pubkey,
        kind: decoded.data.kind,
        npub: npubForPubkey(decoded.data.pubkey) ?? undefined,
        relayHints: decoded.data.relays ?? [],
        authorName: profile?.name ?? undefined,
        authorUsername: profile?.username ?? undefined,
        authorPicture: profile?.picture ?? undefined,
        authorAbout: profile?.about ?? undefined,
        href: `https://jumble.social/notes/${match[1]!}`,
        label:
          decoded.data.kind === 30023
            ? 'Read long-form post on Jumble'
            : 'Open addressable event on Jumble',
        showActions: false,
      });
    } catch {
      continue;
    }
  }

  return [...references.values()];
}

function inlineProfilesForDisplayEvent({
  event,
  profileByPubkey,
}: {
  event: NostrEvent;
  profileByPubkey: Map<string, ProfileMetadata>;
}): Record<string, InlineProfile> {
  const inlineProfiles = inlineProfilesFromEvent({ event, profileByPubkey });

  for (const tag of event.tags) {
    if (tag[0] !== 'p' || !tag[1]) {
      continue;
    }

    const npub = npubForPubkey(tag[1]);

    if (!npub) {
      continue;
    }

    inlineProfiles[`nostr:${npub}`] = inlineProfileForPubkey({
      pubkey: tag[1],
      profileByPubkey,
    });
  }

  return inlineProfiles;
}

function latestPostNode({
  post,
  profile,
  relayHints,
}: NostrPostNodeProps): WebNode {
  return el({
    tag: 'nostrPost',
    props: {
      size: 'sm',
      nostrEventId: post.id,
      nostrPubkey: post.pubkey,
      nostrNpub: profile.npub ?? npubForPubkey(post.pubkey) ?? undefined,
      nostrAuthorName: profile.name ?? undefined,
      nostrAuthorUsername: profile.username ?? undefined,
      nostrAuthorPicture: profile.picture ?? undefined,
      nostrAuthorAbout: profile.about ?? undefined,
      nostrRelayHints: relayHints,
      nostrCreatedAt: post.createdAt,
      nostrContent: post.content,
      nostrInlineProfiles: post.inlineProfiles,
      nostrEmbeds: post.embeds,
      nostrReplyContext: post.replyContext,
      nostrShowReplyContext: post.replyContext.length > 0,
      nostrReplyAction: replyEventAction({
        event: post.event,
        profile,
        relayHints,
      }),
      nostrRepostAction: repostEventAction({
        event: post.event,
        profile,
        relayHints,
      }),
      nostrPreviewImages: true,
      nostrShowActions: true,
    },
    children: [],
  });
}

function profileTabButton({
  payload,
  activeTab,
  tab,
  label,
}: {
  payload: ProfilePayload;
  activeTab: ProfileTab;
  tab: ProfileTab;
  label: string;
}): WebNode {
  const isActive = activeTab === tab;

  return el({
    tag: 'button',
    props: {
      label,
      className: `web-button widget-tab${isActive ? ' active' : ''}`,
      action: profileTabAction(payload, tab),
    },
    children: [],
  });
}

function profileRoot({
  payload,
  currentUserPubkey,
  activeTab,
  latestPosts,
}: ProfileRootProps): WebNodeRoot {
  const npub = payload.npub ?? npubForPubkey(payload.pubkey);
  const nprofile = nprofileForPayload(payload);

  const relayHints = uniqueRelays([
    ...payload.relayHints,
    ...payload.fallbackRelays,
  ]);

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

  const followedByFollowsCount =
    getFollowedByFollowsState()[payload.pubkey.toLowerCase()];

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
    ...payload.profileActions.map((action) =>
      el({
        tag: 'button',
        props: {
          label: action.label,
          title: action.ariaLabel,
          action: action.action ?? undefined,
          disabled: action.disabled,
          className: action.active ? 'web-button active' : 'web-button',
        },
        children: [],
      }),
    ),
    el({
      tag: 'button',
      props: {
        label: 'Open in nostr',
        action: openNostrShareAction({
          type: 'nprofile',
          identifier: nprofile,
          prefixes: payload.sharePrefixes,
        }),
      },
      children: [],
    }),
    el({
      tag: 'button',
      props: { label: 'Copy nprofile1', action: copyNprofileAction(nprofile) },
      children: [],
    }),
  );

  const profileContent: WebNode[] = [
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
    ...(typeof followedByFollowsCount === 'number'
      ? [
          el({
            tag: 'text',
            props: { tone: 'muted', size: 'sm' },
            children: [
              text(
                followedByFollowsCount === 1
                  ? 'Followed by 1 person you follow'
                  : `Followed by ${followedByFollowsCount} people you follow`,
              ),
            ],
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
  ];

  const latestPostContent: WebNode[] =
    latestPosts == null
      ? [
          el({
            tag: 'text',
            props: { tone: 'muted' },
            children: [text('Loading latest posts...')],
          }),
        ]
      : latestPosts.length > 0
        ? latestPosts.map((post) =>
            latestPostNode({ post, profile: payload, relayHints }),
          )
        : [
            el({
              tag: 'text',
              props: { tone: 'muted' },
              children: [text('No recent posts found.')],
            }),
          ];

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
        el({
          tag: 'row',
          props: {
            className: 'widget-tabs',
            gap: 'xs',
            itemAlign: 'center',
          },
          children: [
            profileTabButton({
              payload,
              activeTab,
              tab: 'profile',
              label: 'Profile',
            }),
            profileTabButton({
              payload,
              activeTab,
              tab: 'latestPosts',
              label: 'Latest Posts',
            }),
          ],
        }),
        el({
          tag: 'stack',
          props: { gap: 'sm' },
          children:
            activeTab === 'profile' ? profileContent : latestPostContent,
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

function replyContextFromEvent({
  event,
  viewedProfile,
  profileByPubkey,
  relayHints,
}: ReplyContextFromEventProps): LatestProfilePostReference {
  const profile = eventProfileMetadata({
    event,
    viewedProfile,
    profileByPubkey,
  });

  return {
    type: 'event',
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    npub: npubForPubkey(event.pubkey) ?? undefined,
    authorName: profile?.name ?? undefined,
    authorUsername: profile?.username ?? undefined,
    authorPicture: profile?.picture ?? undefined,
    authorAbout: profile?.about ?? undefined,
    relayHints,
    createdAt: event.created_at,
    content: displayContentForEvent(event),
    replyAction: replyEventAction({ event, profile, relayHints }),
    repostAction: repostEventAction({ event, profile, relayHints }),
    showActions: true,
    inlineProfiles: inlineProfilesForDisplayEvent({ event, profileByPubkey }),
    embeddedReferences: addressReferencesForContent({
      content: displayContentForEvent(event),
      viewedProfile,
      profileByPubkey,
    }),
  };
}

function addressKey({
  kind,
  pubkey,
  identifier,
}: {
  kind: number;
  pubkey: string;
  identifier: string;
}): string {
  return `${kind}:${pubkey.toLowerCase()}:${identifier}`;
}

function targetKey(target: EventReferenceTarget): string {
  return target.type === 'event'
    ? `event:${target.eventId}`
    : `address:${addressKey(target)}`;
}

function targetFromNip19(value: string): EventReferenceTarget | null {
  try {
    const decoded = nip19.decode(value);

    if (decoded.type === 'note') {
      return {
        type: 'event',
        eventId: decoded.data.toLowerCase(),
        authorPubkey: null,
      };
    }

    if (decoded.type === 'nevent') {
      return {
        type: 'event',
        eventId: decoded.data.id.toLowerCase(),
        authorPubkey: decoded.data.author?.toLowerCase() ?? null,
      };
    }

    if (decoded.type === 'naddr') {
      return {
        type: 'address',
        kind: decoded.data.kind,
        pubkey: decoded.data.pubkey.toLowerCase(),
        identifier: decoded.data.identifier,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function createProfilePostGraph(
  response: NostrProfilePostsResponse,
): ProfilePostGraph {
  const eventsById = new Map(
    response.graph.events.map((event) => [event.id, event]),
  );

  const eventsByAddress = new Map<string, NostrEvent>();

  for (const event of response.graph.events) {
    if (
      event.kind === 0 ||
      event.kind === 3 ||
      (event.kind >= 10_000 && event.kind < 20_000) ||
      (event.kind >= 30_000 && event.kind < 40_000)
    ) {
      const identifier =
        event.kind >= 30_000 && event.kind < 40_000
          ? (event.tags.find((tag) => tag[0] === 'd')?.[1] ?? '')
          : '';

      eventsByAddress.set(
        addressKey({ kind: event.kind, pubkey: event.pubkey, identifier }),
        event,
      );
    }
  }

  const edgesBySource = new Map<string, EventReferenceEdge[]>();

  for (const edge of response.graph.edges) {
    const edges = edgesBySource.get(edge.sourceEventId) ?? [];

    edges.push(edge);
    edgesBySource.set(edge.sourceEventId, edges);
  }

  return { eventsById, eventsByAddress, edgesBySource };
}

function eventForTarget(
  target: EventReferenceTarget,
  graph: ProfilePostGraph,
): NostrEvent | null {
  return target.type === 'event'
    ? (graph.eventsById.get(target.eventId) ?? null)
    : (graph.eventsByAddress.get(addressKey(target)) ?? null);
}

function resolvedReferencesForEvent({
  event,
  viewedProfile,
  profileByPubkey,
  graph,
  defaultRelayHints,
  depth,
  visitedEventIds,
}: ResolvedReferencesProps): WebNostrPostReference[] {
  const references: WebNostrPostReference[] = [];
  const sourceEdges = graph.edgesBySource.get(event.id) ?? [];
  const content = displayContentForEvent(event);

  for (const match of content.matchAll(NOSTR_REFERENCE_RE)) {
    const target = targetFromNip19(match[1]!);

    if (!target) {
      continue;
    }

    const edge = sourceEdges.find(
      (candidate) =>
        candidate.role === 'embed' &&
        targetKey(candidate.target) === targetKey(target),
    );

    const relayHints = uniqueRelays([
      ...(edge?.relayHints ?? []),
      ...defaultRelayHints,
    ]);

    const resolvedEvent = edge ? eventForTarget(edge.target, graph) : null;

    if (target.type === 'address') {
      const addressReference = addressReferencesForContent({
        content: match[0],
        viewedProfile,
        profileByPubkey,
      })[0];

      if (!addressReference) {
        continue;
      }

      if (!resolvedEvent) {
        references.push({ ...addressReference, relayHints });
        continue;
      }

      const nestedVisited = new Set(visitedEventIds).add(resolvedEvent.id);

      references.push({
        ...addressReference,
        relayHints,
        createdAt: resolvedEvent.created_at,
        content: displayContentForEvent(resolvedEvent),
        inlineProfiles: inlineProfilesForDisplayEvent({
          event: resolvedEvent,
          profileByPubkey,
        }),
        embeddedReferences:
          depth < 2 && !visitedEventIds.has(resolvedEvent.id)
            ? resolvedReferencesForEvent({
                event: resolvedEvent,
                viewedProfile,
                profileByPubkey,
                graph,
                defaultRelayHints,
                depth: depth + 1,
                visitedEventIds: nestedVisited,
              })
            : [],
      });

      continue;
    }

    if (!resolvedEvent) {
      continue;
    }

    const reference = replyContextFromEvent({
      event: resolvedEvent,
      viewedProfile,
      profileByPubkey,
      relayHints,
    });

    const nestedVisited = new Set(visitedEventIds).add(resolvedEvent.id);

    references.push({
      ...reference,
      token: match[0],
      embeddedReferences:
        depth < 2 && !visitedEventIds.has(resolvedEvent.id)
          ? resolvedReferencesForEvent({
              event: resolvedEvent,
              viewedProfile,
              profileByPubkey,
              graph,
              defaultRelayHints,
              depth: depth + 1,
              visitedEventIds: nestedVisited,
            })
          : [],
    });
  }

  return references;
}

function replyContextFromGraph({
  event,
  viewedProfile,
  profileByPubkey,
  graph,
  defaultRelayHints,
}: Omit<
  ResolvedReferencesProps,
  'depth' | 'visitedEventIds'
>): LatestProfilePostReference[] {
  const seenEventIds = new Set<string>();
  const references: LatestProfilePostReference[] = [];

  for (const edge of graph.edgesBySource.get(event.id) ?? []) {
    if (edge.role !== 'thread-root' && edge.role !== 'thread-parent') {
      continue;
    }

    const context = eventForTarget(edge.target, graph);

    if (!context || seenEventIds.has(context.id)) {
      continue;
    }

    seenEventIds.add(context.id);

    const relayHints = uniqueRelays([...edge.relayHints, ...defaultRelayHints]);

    const reference = replyContextFromEvent({
      event: context,
      viewedProfile,
      profileByPubkey,
      relayHints,
    });

    references.push({
      ...reference,
      embeddedReferences: resolvedReferencesForEvent({
        event: context,
        viewedProfile,
        profileByPubkey,
        graph,
        defaultRelayHints,
        depth: 1,
        visitedEventIds: new Set([event.id, context.id]),
      }),
    });
  }

  return references;
}

function latestProfilePostFromEvent({
  event,
  viewedProfile,
  profileByPubkey,
  graph,
  defaultRelayHints,
}: LatestProfilePostFromEventProps): LatestProfilePost {
  const content = displayContentForEvent(event);

  const resolvedReferences = resolvedReferencesForEvent({
    event,
    viewedProfile,
    profileByPubkey,
    graph,
    defaultRelayHints,
    depth: 0,
    visitedEventIds: new Set([event.id]),
  });

  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    createdAt: event.created_at,
    content,
    event,
    inlineProfiles: inlineProfilesForDisplayEvent({ event, profileByPubkey }),
    replyContext: replyContextFromGraph({
      event,
      viewedProfile,
      profileByPubkey,
      graph,
      defaultRelayHints,
    }),
    embeds: Object.fromEntries(
      resolvedReferences.flatMap((reference) =>
        reference.token ? [[reference.token, reference]] : [],
      ),
    ),
  };
}

export function collectGraphProfilePubkeys({
  response,
  viewedPubkey,
}: {
  response: NostrProfilePostsResponse;
  viewedPubkey: string;
}): string[] {
  const pubkeys = new Set<string>();

  for (const event of response.graph.events) {
    pubkeys.add(event.pubkey.toLowerCase());

    for (const tag of event.tags) {
      if (tag[0] === 'p' && tag[1]) {
        pubkeys.add(tag[1].toLowerCase());
      }
    }
  }

  for (const edge of response.graph.edges) {
    if (edge.target.type === 'event' && edge.target.authorPubkey) {
      pubkeys.add(edge.target.authorPubkey.toLowerCase());
    } else if (edge.target.type === 'address') {
      pubkeys.add(edge.target.pubkey.toLowerCase());
    }
  }

  pubkeys.delete(viewedPubkey.toLowerCase());

  return [...pubkeys].slice(0, 30);
}

export function buildLatestProfilePostsFromResolution({
  response,
  viewedProfile,
  profileByPubkey,
  defaultRelayHints,
}: BuildLatestProfilePostsProps): LatestProfilePost[] {
  const graph = createProfilePostGraph(response);

  return response.primaryEvents.map((event) =>
    latestProfilePostFromEvent({
      event,
      viewedProfile,
      profileByPubkey,
      graph,
      defaultRelayHints,
    }),
  );
}

export function buildProfilePostsRequest({
  pubkey,
  profile,
}: BuildProfilePostsRequestProps): NostrProfilePostsRequest {
  return NostrProfilePostsRequestSchema.parse({
    pubkey,
    relayHints: uniqueRelays(profile.relayHints).slice(0, 8),
    fallbackRelays: uniqueRelays(profile.fallbackRelays).slice(0, 8),
    limit: 10,
  });
}

async function fetchLatestProfilePosts({
  pubkey,
  profile,
}: FetchLatestProfilePostsProps): Promise<LatestProfilePost[]> {
  const request = buildProfilePostsRequest({ pubkey, profile });

  const response = NostrProfilePostsResponseSchema.parse(
    await postJson<unknown>('/api/nostr/profile-posts', request),
  );

  const profilePubkeys = collectGraphProfilePubkeys({
    response,
    viewedPubkey: pubkey,
  });

  const profileMetadataResults = await Promise.allSettled(
    profilePubkeys.map(
      async (profilePubkey) =>
        [
          profilePubkey.toLowerCase(),
          await fetchProfileMetadata({
            pubkey: profilePubkey,
            relays: PROFILE_RELAYS_FOR_QUERY as string[],
          }),
        ] as const,
    ),
  );

  const profileByPubkey = new Map(
    profileMetadataResults.flatMap((result) =>
      result.status === 'fulfilled' && result.value[1] !== null
        ? [result.value as readonly [string, ProfileMetadata]]
        : [],
    ),
  );

  return buildLatestProfilePostsFromResolution({
    response,
    viewedProfile: profile,
    profileByPubkey,
    defaultRelayHints: uniqueRelays([
      ...request.relayHints,
      ...request.fallbackRelays,
    ]),
  });
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

  const followedByFollowsPromise = fetchFollowedByFollowsCount(
    payload.pubkey,
  ).catch(() => undefined);

  let renderedPayload = payload;
  let fetchedMetadata: ProfileMetadata | null = null;
  let latestPosts: LatestProfilePost[] | null = null;

  setChromeModal({
    command: 'nostr',
    subcommand: 'profile',
    title: 'Nostr profile',
  });

  setChromeWeb(
    profileRoot({
      payload,
      currentUserPubkey,
      activeTab: payload.tab,
      latestPosts,
    }),
  );

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

  const followedByFollowsCount = await followedByFollowsPromise;

  if (followedByFollowsCount !== undefined) {
    setFollowedByFollowsState((current) => ({
      ...current,
      [payload.pubkey.toLowerCase()]: followedByFollowsCount,
    }));
  }

  setChromeWeb(
    profileRoot({
      payload: renderedPayload,
      currentUserPubkey,
      activeTab: renderedPayload.tab,
      latestPosts,
    }),
  );

  if (renderedPayload.tab === 'latestPosts') {
    try {
      latestPosts = await fetchLatestProfilePosts({
        pubkey: renderedPayload.pubkey,
        profile: renderedPayload,
      });
    } catch (error) {
      setChromeError(error instanceof Error ? error.message : String(error));
      latestPosts = [];
    }

    setChromeWeb(
      profileRoot({
        payload: renderedPayload,
        currentUserPubkey,
        activeTab: renderedPayload.tab,
        latestPosts,
      }),
    );
  }

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

    setChromeWeb(
      profileRoot({
        payload: renderedPayload,
        currentUserPubkey,
        activeTab: renderedPayload.tab,
        latestPosts,
      }),
    );
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

    setChromeWeb(
      profileRoot({
        payload,
        currentUserPubkey: signed.pubkey,
        activeTab: payload.tab,
        latestPosts: null,
      }),
    );

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
  profileActions,
  sharePrefixes,
}: BuildNostrProfileActionPayloadProps): ProfilePayload {
  return ProfilePayloadSchema.parse({
    pubkey,
    npub,
    name,
    username,
    picture,
    about,
    relayHints,
    profileActions,
    sharePrefixes,
  });
}

export function buildNostrOpenProfileAction(
  payload: ProfilePayload,
): WebAction {
  return profileAction(payload);
}
