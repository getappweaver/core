import { kinds, nip19 } from 'nostr-tools';
import type { Accessor, JSX } from 'solid-js';
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  useContext,
} from 'solid-js';

import { nostrShareUrl, type NostrSharePrefixes } from '@src/web/nostr-share';
import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebNostrPostElement as NostrPostElement,
  WebNostrPostProps,
  WebNostrPostReference,
} from '@src/web/ui-schema';

import type { RunWebActionParams } from '../../commands/types';
import { resolveNostrEventContext } from '../../nostr/interactionResolution';
import { getNostrInteractionFlags } from '../../nostr/interactionState';
import {
  buildNostrOpenProfileAction,
  buildNostrProfileActionPayload,
} from '../../nostr/profileAction';
import { fetchJson } from '../../utils';

import {
  useWebCurrentUserPubkey,
  useWebEntityPending,
  WebPendingEntityContext,
} from './contexts';
import { elementClass, elementStyle, elementUi } from './element-helpers';

const NOSTR_REFERENCE_RE = /nostr:[a-z0-9]+/gi;

const IMAGE_URL_RE =
  /https?:\/\/[^\s<>()"']+\.(?:avif|gif|jpe?g|png|webp)(?:\?[^\s<>()"']*)?/gi;

const URL_RE = /https?:\/\/[^\s<>()"']+/gi;

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'];

const AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.wav',
  '.flac',
];

const MAX_NESTED_REFERENCE_DEPTH = 4;
const SUPPORTED_NOSTR_CONTENT_KINDS = new Set([1, 1111, 9802, 30023]);

const NOSTR_KIND_NAME_BY_NUMBER = new Map<number, string>();

for (const [name, value] of Object.entries(kinds)) {
  if (typeof value === 'number' && !NOSTR_KIND_NAME_BY_NUMBER.has(value)) {
    NOSTR_KIND_NAME_BY_NUMBER.set(value, name);
  }
}

const SOCIAL_REFERENCE_KINDS = new Set<number>([
  kinds.ForumThread,
  kinds.PublicMessage,
  kinds.Photo,
  kinds.NormalVideo,
  kinds.ShortVideo,
  kinds.ChannelMessage,
  kinds.PodcastEpisode,
  kinds.Poll,
  kinds.Voice,
  kinds.Scroll,
  kinds.VoiceComment,
  kinds.LiveChatMessage,
  kinds.CodeSnippet,
  kinds.LiveEvent,
]);

function readableKindName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function openNostrEventLabel(kind: number | undefined): string {
  if (kind === undefined) {
    return 'Open nostr event';
  }

  const name = NOSTR_KIND_NAME_BY_NUMBER.get(kind);

  return name && SOCIAL_REFERENCE_KINDS.has(kind)
    ? `Open ${readableKindName(name)} · kind ${kind}`
    : `Open nostr event · kind ${kind}`;
}

type InlineProfile = NonNullable<
  NonNullable<WebNostrPostProps['nostrInlineProfiles']>
>[string];

type WebNostrPostElementProps = {
  element: NostrPostElement;
  runAction: RunPostAction;
};

type RunPostAction = (
  action: WebAction | undefined,
  entityKey?: string | null,
  params?: RunWebActionParams,
) => void;

type PostActionItem = {
  label: string;
  ariaLabel?: string;
  icon?: 'translate';
  action: WebAction | null;
  disabled: boolean;
  success: boolean;
  separatorBefore?: 'pipe';
};

type ContentAttachment =
  | { type: 'image'; url: string }
  | { type: 'video'; url: string }
  | { type: 'audio'; url: string }
  | { type: 'link'; url: string };

type OpenImagePreview = (url: string, urls: string[]) => void;

type ReferenceResolutionStatus = NonNullable<
  WebNostrPostReference['resolutionStatus']
>;

function TranslateIcon(): JSX.Element {
  return (
    <svg
      class="web-nostrPost__actionIcon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12.913 17H20.087M12.913 17L11 21M12.913 17L15.7783 11.009C16.0092 10.5263 16.1246 10.2849 16.2826 10.2086C16.4199 10.1423 16.5801 10.1423 16.7174 10.2086C16.8754 10.2849 16.9908 10.5263 17.2217 11.009L20.087 17M20.087 17L22 21M2 5H8M8 5H11.5M8 5V3M11.5 5H14M11.5 5C11.0039 7.95729 9.85259 10.6362 8.16555 12.8844M10 14C9.38747 13.7248 8.76265 13.3421 8.16555 12.8844M8.16555 12.8844C6.81302 11.8478 5.60276 10.4266 5 9M8.16555 12.8844C6.56086 15.0229 4.47143 16.7718 2 18"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function nodeText(node: WebNode): string {
  if (node.type === 'text') {
    return node.value;
  }

  return (node.children ?? []).map(nodeText).join('');
}

function translationContent(root: WebNodeRoot): string | null {
  if (
    root.meta.command !== 'translation' ||
    root.meta.subcommand !== 'translate' ||
    root.tree.type !== 'element'
  ) {
    return null;
  }

  const contentNode = root.tree.children?.[1];

  return contentNode ? nodeText(contentNode) : null;
}

type PostTranslationController = {
  pending: Accessor<boolean>;
  content: Accessor<string | null>;
  error: Accessor<string | null>;
  visible: Accessor<boolean>;
  setVisible: (visible: boolean) => void;
  run: (action: WebAction | null) => void;
};

type CreatePostTranslationProps = {
  runAction: RunPostAction;
  entityKey: Accessor<string | null>;
};

function createPostTranslation({
  runAction,
  entityKey,
}: CreatePostTranslationProps): PostTranslationController {
  const [pending, setPending] = createSignal(false);
  const [content, setContent] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [visible, setVisible] = createSignal(false);

  const run = (action: WebAction | null): void => {
    if (action?.type !== 'capability') {
      runAction(action ?? undefined, entityKey());

      return;
    }

    if (content() !== null) {
      setVisible(true);

      return;
    }

    setPending(true);
    setError(null);

    runAction(action, null, {
      onCapabilityResult: (root) => {
        const translated = translationContent(root);

        if (translated === null) {
          return false;
        }

        setContent(translated);
        setVisible(true);

        return true;
      },
      onCapabilityError: setError,
      onCapabilitySettled: () => setPending(false),
    });
  };

  return { pending, content, error, visible, setVisible, run };
}

function PostTranslationPanel(props: {
  translation: PostTranslationController;
}): JSX.Element {
  return (
    <Show
      when={
        props.translation.error() !== null ||
        props.translation.content() !== null
      }
    >
      <div class="web-nostrPost__translation">
        <Show when={props.translation.content() !== null}>
          <div
            class="web-nostrPost__translationTabs"
            role="group"
            aria-label="Post language"
          >
            <button
              type="button"
              class="web-nostrPost__translationTab"
              classList={{ active: !props.translation.visible() }}
              aria-pressed={!props.translation.visible()}
              onClick={() => props.translation.setVisible(false)}
            >
              Original
            </button>
            <button
              type="button"
              class="web-nostrPost__translationTab"
              classList={{ active: props.translation.visible() }}
              aria-pressed={props.translation.visible()}
              onClick={() => props.translation.setVisible(true)}
            >
              Translated
            </button>
          </div>
        </Show>
        <Show when={props.translation.error()}>
          {(message) => (
            <div class="web-nostrPost__translationError" role="alert">
              {message()}
            </div>
          )}
        </Show>
        <Show when={props.translation.visible() && props.translation.content()}>
          {(translated) => (
            <div class="web-nostrPost__translationContent">{translated()}</div>
          )}
        </Show>
      </div>
    </Show>
  );
}

function referenceResolutionStatus(
  reference: WebNostrPostReference,
): ReferenceResolutionStatus {
  if (reference.resolutionStatus) {
    return reference.resolutionStatus;
  }

  return (reference.type === 'event' || reference.type === 'address') &&
    reference.id &&
    reference.content === undefined
    ? 'unresolved'
    : 'resolved';
}

type EventContextRequest = Parameters<typeof resolveNostrEventContext>[0];
type EventContextResponsePromise = ReturnType<typeof resolveNostrEventContext>;
type EventContextResponse = Awaited<EventContextResponsePromise>;
type ResolvedNostrEvent = EventContextResponse['targetEvent'];

type DecodedContentEventReference = {
  token: string;
  id: string;
  authorPubkey: string | null;
  relayHints: string[];
};

function decodeContentEventReference(
  token: string,
): DecodedContentEventReference | null {
  try {
    const decoded = nip19.decode(token.slice('nostr:'.length));

    if (decoded.type === 'note') {
      return {
        token,
        id: decoded.data,
        authorPubkey: null,
        relayHints: [],
      };
    }

    if (decoded.type === 'nevent') {
      return {
        token,
        id: decoded.data.id,
        authorPubkey: decoded.data.author ?? null,
        relayHints: decoded.data.relays ?? [],
      };
    }
  } catch {
    return null;
  }

  return null;
}

function contentEventReferences(
  content: string,
): DecodedContentEventReference[] {
  const references = new Map<string, DecodedContentEventReference>();

  for (const match of content.matchAll(NOSTR_REFERENCE_RE)) {
    const decoded = decodeContentEventReference(match[0]);

    if (decoded && !references.has(decoded.id)) {
      references.set(decoded.id, decoded);
    }
  }

  return [...references.values()];
}

function sourceEventReference(source: string): WebNostrPostReference | null {
  const trimmed = source.trim();

  const token = trimmed.startsWith('nostr:')
    ? trimmed
    : trimmed.startsWith('nevent1') ||
        trimmed.startsWith('note1') ||
        trimmed.startsWith('naddr1')
      ? `nostr:${trimmed}`
      : null;

  if (!token) {
    return null;
  }

  try {
    const decoded = nip19.decode(token.slice('nostr:'.length));

    if (decoded.type === 'naddr') {
      return {
        token,
        type: 'address',
        id: `${decoded.data.kind}:${decoded.data.pubkey}:${decoded.data.identifier}`,
        pubkey: decoded.data.pubkey,
        kind: decoded.data.kind,
        relayHints: decoded.data.relays ?? [],
        resolutionStatus: 'unresolved',
        showActions: false,
      };
    }
  } catch {
    return null;
  }

  const decoded = decodeContentEventReference(token);

  return decoded
    ? {
        token,
        type: 'event',
        id: decoded.id,
        pubkey: decoded.authorPubkey ?? undefined,
        relayHints: decoded.relayHints,
        resolutionStatus: 'unresolved',
        showActions: false,
      }
    : null;
}

function isHttpSource(source: string): boolean {
  try {
    const url = new URL(source);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

type HighlightContentProps = {
  content: string;
  source: string | undefined;
  sharePrefixes: WebNostrPostReference['sharePrefixes'];
  sourceLoaded: boolean;
  onToggleSource: (reference: WebNostrPostReference) => void;
  runAction: RunPostAction;
};

function HighlightContent(props: HighlightContentProps): JSX.Element {
  const initialSource = props.source
    ? sourceEventReference(props.source)
    : null;

  const [nostrSource, setNostrSource] =
    createSignal<WebNostrPostReference | null>(initialSource);

  onMount(() => {
    if (!initialSource) {
      return;
    }

    void resolveReferenceTarget({
      reference: { ...initialSource, sharePrefixes: props.sharePrefixes },
      depth: 0,
      visitedIds: new Set(),
    })
      .then(setNostrSource)
      .catch(() => {});
  });

  const sourceTime = () => relativeTime(nostrSource()?.createdAt, Date.now());

  const sourceHandle = () =>
    firstNonEmpty([
      nostrSource()?.authorUsername ?? '',
      nostrSource()?.authorName ?? '',
      shortValue(nostrSource()?.npub),
      shortValue(nostrSource()?.pubkey),
    ]) ?? 'unknown';

  return (
    <div class="web-nostrPost__highlight">
      <blockquote>{props.content}</blockquote>
      <Show when={props.source}>
        {(value) =>
          isHttpSource(value()) ? (
            <a
              class="web-nostrPost__highlightSource"
              href={value()}
              target="_blank"
              rel="noopener noreferrer"
            >
              {value()}
            </a>
          ) : nostrSource() ? (
            <div class="web-nostrPost__highlightNostrSource">
              <div class="web-nostrPost__highlightMeta">
                From{' '}
                <button
                  type="button"
                  class="web-nostrPost__authorButton web-nostrPost__highlightAuthor"
                  onClick={() =>
                    props.runAction(profileActionForReference(nostrSource()!))
                  }
                  disabled={!nostrSource()?.pubkey}
                >
                  @{sourceHandle()}
                </button>
                <Show when={sourceTime()}>{(time) => <> · {time()}</>}</Show>
                <Show when={nostrSource()?.title}>
                  {(title) => <> · {title()}</>}
                </Show>
              </div>
              <button
                type="button"
                class="web-nostrPost__replyLink web-nostrPost__highlightLoad"
                onClick={() => props.onToggleSource(nostrSource()!)}
              >
                {nostrSource()?.kind === 30023
                  ? props.sourceLoaded
                    ? 'Hide article'
                    : 'Show article'
                  : props.sourceLoaded
                    ? 'Hide nostr event'
                    : 'Show nostr event'}
              </button>
            </div>
          ) : (
            <span class="web-nostrPost__highlightSource">{value()}</span>
          )
        }
      </Show>
    </div>
  );
}

function effectiveSharePrefixes(
  reference: WebNostrPostReference,
  fallback?: WebNostrPostReference['sharePrefixes'],
): NostrSharePrefixes {
  return {
    nevent: reference.sharePrefixes?.nevent ?? fallback?.nevent ?? 'nostr://',
    nprofile:
      reference.sharePrefixes?.nprofile ?? fallback?.nprofile ?? 'nostr://',
  };
}

function openNostrEventHref(
  reference: WebNostrPostReference,
  fallbackSharePrefixes?: WebNostrPostReference['sharePrefixes'],
): string | null {
  if (!reference.id) {
    return null;
  }

  try {
    const nevent = nip19.neventEncode({
      id: reference.id,
      relays: reference.relayHints,
      author: reference.pubkey,
      kind: reference.kind,
    });

    return nostrShareUrl({
      type: 'nevent',
      identifier: nevent,
      prefixes: effectiveSharePrefixes(reference, fallbackSharePrefixes),
    });
  } catch {
    return null;
  }
}

const pendingThreadContextRequests = new Map<
  string,
  EventContextResponsePromise
>();

function resolveThreadContextRequest(
  input: EventContextRequest,
): EventContextResponsePromise {
  const requestKey = input.eventId ?? input.address;

  if (!requestKey) {
    return Promise.reject(new Error('Missing Nostr event resolution target.'));
  }

  const existing = pendingThreadContextRequests.get(requestKey);

  if (existing) {
    return existing;
  }

  const pending = resolveNostrEventContext(input).finally(() => {
    if (pendingThreadContextRequests.get(requestKey) === pending) {
      pendingThreadContextRequests.delete(requestKey);
    }
  });

  pendingThreadContextRequests.set(requestKey, pending);

  return pending;
}

type ResolveReferenceTargetProps = {
  reference: WebNostrPostReference;
  depth: number;
  visitedIds: Set<string>;
};

async function resolveReferenceTarget({
  reference,
  depth,
  visitedIds,
}: ResolveReferenceTargetProps): Promise<WebNostrPostReference> {
  const decoded = reference.token
    ? decodeContentEventReference(reference.token)
    : null;

  const address = reference.type === 'address' ? (reference.id ?? null) : null;
  const eventId = address ? null : (reference.id ?? decoded?.id ?? null);
  const authorPubkey = reference.pubkey ?? decoded?.authorPubkey ?? null;
  const targetKey = eventId ?? address;

  if (
    !targetKey ||
    depth >= MAX_NESTED_REFERENCE_DEPTH ||
    visitedIds.has(targetKey)
  ) {
    throw new Error('Invalid or repeated Nostr reference target.');
  }

  const response = await resolveThreadContextRequest({
    eventId,
    authorPubkey,
    address,
    targetEvent: null,
    relayHints: [
      ...new Set([
        ...(reference.relayHints ?? []),
        ...(decoded?.relayHints ?? []),
      ]),
    ],
    fallbackRelays: [],
    includeDirectReplies: false,
    replyLimit: 1,
    threadContextOnly: true,
    resolutionMode: reference.resolutionMode ?? 'persistent',
  });

  return resolvedReferenceTree({
    reference,
    event: response.targetEvent,
    response,
    depth,
    visitedIds,
  });
}

type ResolvedReferenceProps = {
  reference: WebNostrPostReference;
  event: Awaited<ReturnType<typeof resolveNostrEventContext>>['targetEvent'];
  relayHints: string[];
  profile: ResolvedAuthorProfile | null;
};

type ResolvedAuthorProfile = {
  name: string | null;
  displayName: string | null;
  picture: string | null;
  about: string | null;
};

function resolvedAuthorProfiles(
  events: Awaited<ReturnType<typeof resolveNostrEventContext>>['profileEvents'],
): Map<string, ResolvedAuthorProfile> {
  return new Map(
    events.flatMap((event) => {
      try {
        const content = JSON.parse(event.content) as Record<string, unknown>;

        const stringValue = (value: unknown) =>
          typeof value === 'string' && value.trim() ? value : null;

        return [
          [
            event.pubkey,
            {
              name: stringValue(content.name),
              displayName: stringValue(content.display_name),
              picture: stringValue(content.picture),
              about: stringValue(content.about),
            },
          ] as const,
        ];
      } catch {
        return [];
      }
    }),
  );
}

function resolvedReference({
  reference,
  event,
  relayHints,
  profile,
}: ResolvedReferenceProps): WebNostrPostReference {
  const resolvedRelayHints = [
    ...new Set([...(reference.relayHints ?? []), ...relayHints]),
  ];

  const eventJson = JSON.stringify(event);

  const rootTag = event.tags.find(
    (tag) => tag[0] === 'e' && tag[3] === 'root' && tag[1],
  );

  const nrAlias =
    reference.readAction?.type === 'command'
      ? reference.readAction.command
      : reference.archiveAction?.type === 'command'
        ? reference.archiveAction.command
        : 'nr';

  const markActionWithEvent = (action: WebAction | null | undefined) =>
    action?.type === 'command'
      ? {
          ...action,
          options: { ...action.options, event_json: eventJson },
        }
      : action;

  return {
    ...reference,
    type: 'event',
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    createdAt: event.created_at,
    content: event.content,
    title: event.tags.find((tag) => tag[0] === 'title')?.[1],
    source: event.tags.find((tag) => tag[0] === 'r')?.[1],
    npub: nip19.npubEncode(event.pubkey),
    authorName: profile?.displayName ?? undefined,
    authorUsername: profile?.name ?? undefined,
    authorPicture: profile?.picture ?? undefined,
    authorAbout: profile?.about ?? undefined,
    relayHints: resolvedRelayHints,
    resolutionStatus: 'resolved',
    readAction: markActionWithEvent(reference.readAction),
    archiveAction: markActionWithEvent(reference.archiveAction),
    likeAction: {
      type: 'clientAction',
      action: 'nostr.likeEvent',
      payload: {
        eventId: event.id,
        eventPubkey: event.pubkey,
        eventKind: event.kind,
        nrAlias,
        relayHints: resolvedRelayHints,
      },
    },
    replyAction: {
      type: 'clientAction',
      action: 'nostr.openReplyPanel',
      payload: {
        eventId: event.id,
        eventPubkey: event.pubkey,
        eventKind: event.kind,
        nrAlias,
        eventCreatedAt: event.created_at,
        eventContent: event.content,
        eventAuthorName: profile?.displayName ?? null,
        eventAuthorUsername: profile?.name ?? null,
        eventAuthorPicture: profile?.picture ?? null,
        eventRawJson: eventJson,
        rootEventId: rootTag?.[1] ?? null,
        rootPubkey: rootTag?.[4] ?? null,
        relayHints: resolvedRelayHints,
      },
    },
    repostAction: {
      type: 'clientAction',
      action: 'nostr.openRepostPanel',
      payload: {
        eventId: event.id,
        eventPubkey: event.pubkey,
        eventKind: event.kind,
        nrAlias,
        eventCreatedAt: event.created_at,
        eventContent: event.content,
        eventAuthorName: profile?.displayName ?? null,
        eventAuthorUsername: profile?.name ?? null,
        eventAuthorPicture: profile?.picture ?? null,
        eventRawJson: eventJson,
        relayHints: resolvedRelayHints,
      },
    },
    showActions: true,
  };
}

type ResolvedReferenceTreeProps = {
  reference: WebNostrPostReference;
  event: ResolvedNostrEvent;
  response: EventContextResponse;
  depth: number;
  visitedIds: Set<string>;
};

function resolvedReferenceTree({
  reference,
  event,
  response,
  depth,
  visitedIds,
}: ResolvedReferenceTreeProps): WebNostrPostReference {
  const profilesByPubkey = resolvedAuthorProfiles(response.profileEvents);

  const edgeRelayHints = new Map(
    response.graph.edges.flatMap((edge) =>
      edge.target.type === 'event'
        ? [
            [
              `${edge.sourceEventId}:${edge.target.eventId}`,
              edge.relayHints,
            ] as const,
          ]
        : [],
    ),
  );

  const resolved = resolvedReference({
    reference,
    event,
    relayHints:
      edgeRelayHints.get(`${reference.id ?? event.id}:${event.id}`) ??
      response.targetRelayHints,
    profile: profilesByPubkey.get(event.pubkey) ?? null,
  });

  if (depth >= MAX_NESTED_REFERENCE_DEPTH) {
    return resolved;
  }

  const eventsById = new Map(
    [response.targetEvent, ...response.graph.events].map((item) => [
      item.id,
      item,
    ]),
  );

  const nextVisitedIds = new Set(visitedIds).add(event.id);

  const embeddedReferences = contentEventReferences(event.content).flatMap(
    (embedded): WebNostrPostReference[] => {
      if (nextVisitedIds.has(embedded.id)) {
        return [];
      }

      const embeddedEvent = eventsById.get(embedded.id);

      const relayHints = [
        ...new Set([
          ...embedded.relayHints,
          ...(edgeRelayHints.get(`${event.id}:${embedded.id}`) ?? []),
        ]),
      ];

      const childReference: WebNostrPostReference = {
        token: embedded.token,
        type: 'event',
        id: embedded.id,
        pubkey: embeddedEvent?.pubkey ?? embedded.authorPubkey ?? undefined,
        relayHints,
        resolutionStatus: embeddedEvent ? 'resolved' : 'unresolved',
        resolveOnLoad: reference.resolveOnLoad,
        resolutionMode: reference.resolutionMode,
        profileResolveReferencesAutomatically:
          reference.profileResolveReferencesAutomatically,
        showActions: embeddedEvent !== undefined,
      };

      return [
        embeddedEvent
          ? resolvedReferenceTree({
              reference: childReference,
              event: embeddedEvent,
              response,
              depth: depth + 1,
              visitedIds: nextVisitedIds,
            })
          : childReference,
      ];
    },
  );

  return embeddedReferences.length > 0
    ? { ...resolved, embeddedReferences }
    : resolved;
}

type LinkPreviewResponse = {
  ok: true;
  preview: {
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
  };
};

function shortValue(value: string | undefined): string {
  if (!value) {
    return '';
  }

  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function firstNonEmpty(values: string[]): string | undefined {
  return values.find((value) => value.trim().length > 0);
}

function displayName(props: WebNostrPostProps | undefined): string {
  return (
    firstNonEmpty([
      props?.nostrAuthorName ?? '',
      props?.nostrAuthorUsername ?? '',
      shortValue(props?.nostrNpub),
      shortValue(props?.nostrPubkey),
    ]) ?? 'unknown'
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '??';
}

function relativeTime(
  timestampSeconds: number | undefined,
  nowMs: number,
): string {
  if (typeof timestampSeconds !== 'number') {
    return '';
  }

  const deltaSeconds = Math.max(
    0,
    Math.floor((nowMs - timestampSeconds * 1000) / 1000),
  );

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);

  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);

  if (deltaDays < 30) {
    return `${deltaDays}d ago`;
  }

  return new Date(timestampSeconds * 1000).toLocaleDateString();
}

function referenceTitle(reference: WebNostrPostReference): string {
  return (
    firstNonEmpty([
      reference.label ?? '',
      reference.authorName ?? '',
      reference.authorUsername ?? '',
      shortValue(reference.npub),
      shortValue(reference.pubkey),
      shortValue(reference.id),
    ]) ?? 'nostr reference'
  );
}

function referenceSubtitle(reference: WebNostrPostReference): string {
  void reference;

  return '';
}

function referenceDisplayName(reference: WebNostrPostReference): string {
  return (
    firstNonEmpty([
      reference.authorName ?? '',
      reference.authorUsername ?? '',
      shortValue(reference.npub),
      shortValue(reference.pubkey),
      shortValue(reference.id),
    ]) ?? 'unknown'
  );
}

type FlashNostrEventProps = {
  source: HTMLElement;
  eventId: string;
};

function flashNostrEvent({ source, eventId }: FlashNostrEventProps): void {
  const root = source.getRootNode();

  const target =
    root instanceof Document || root instanceof ShadowRoot
      ? root.querySelector<HTMLElement>(
          `[data-nostr-event-id="${CSS.escape(eventId)}"]`,
        )
      : null;

  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('web-highlight-flash');
  void target.offsetWidth;
  target.classList.add('web-highlight-flash');

  target.addEventListener(
    'animationend',
    () => target.classList.remove('web-highlight-flash'),
    { once: true },
  );
}

function inlineProfileLabel(profile: InlineProfile): string {
  return `@${
    firstNonEmpty([
      profile.authorName ?? '',
      profile.authorUsername ?? '',
      shortValue(profile.npub),
      shortValue(profile.pubkey),
    ]) ?? 'unknown'
  }`;
}

function profileActionForInlineProfile(
  profile: InlineProfile,
): WebAction | undefined {
  if (!profile.pubkey) {
    return undefined;
  }

  return buildNostrOpenProfileAction(
    buildNostrProfileActionPayload({
      pubkey: profile.pubkey,
      npub: profile.npub ?? null,
      name: profile.authorName ?? null,
      username: profile.authorUsername ?? null,
      picture: profile.authorPicture ?? null,
      about: profile.authorAbout ?? null,
      relayHints: profile.relayHints ?? [],
      profileActions: profile.profileActions ?? [],
      profileActionsReadAction: profile.profileActionsReadAction ?? null,
      resolveReferencesAutomatically: false,
      sharePrefixes: profile.sharePrefixes ?? {
        nevent: 'nostr://',
        nprofile: 'nostr://',
      },
    }),
  );
}

function profileActionForReference(
  reference: WebNostrPostReference,
): WebAction | undefined {
  if (!reference.pubkey) {
    return undefined;
  }

  return buildNostrOpenProfileAction(
    buildNostrProfileActionPayload({
      pubkey: reference.pubkey,
      npub: reference.npub ?? null,
      name: reference.authorName ?? null,
      username: reference.authorUsername ?? null,
      picture: reference.authorPicture ?? null,
      about: reference.authorAbout ?? null,
      relayHints: reference.relayHints ?? [],
      profileActions: reference.profileActions ?? [],
      profileActionsReadAction: reference.profileActionsReadAction ?? null,
      resolveReferencesAutomatically:
        reference.profileResolveReferencesAutomatically ?? false,
      sharePrefixes: reference.sharePrefixes ?? {
        nevent: 'nostr://',
        nprofile: 'nostr://',
      },
    }),
  );
}

function profileActionForElement(
  elementProps: WebNostrPostProps | undefined,
): WebAction | undefined {
  if (!elementProps?.nostrPubkey) {
    return undefined;
  }

  return buildNostrOpenProfileAction(
    buildNostrProfileActionPayload({
      pubkey: elementProps.nostrPubkey,
      npub: elementProps.nostrNpub ?? null,
      name: elementProps.nostrAuthorName ?? null,
      username: elementProps.nostrAuthorUsername ?? null,
      picture: elementProps.nostrAuthorPicture ?? null,
      about: elementProps.nostrAuthorAbout ?? null,
      relayHints: elementProps.nostrRelayHints ?? [],
      profileActions: elementProps.nostrProfileActions ?? [],
      profileActionsReadAction:
        elementProps.nostrProfileActionsReadAction ?? null,
      resolveReferencesAutomatically:
        elementProps.nostrProfileResolveReferencesAutomatically ?? false,
      sharePrefixes: elementProps.nostrSharePrefixes ?? {
        nevent: 'nostr://',
        nprofile: 'nostr://',
      },
    }),
  );
}

function uniqueContentReferences(
  content: string,
  embeds: Record<string, WebNostrPostReference>,
): string[] {
  const seen = new Set<string>();
  const references: string[] = [];

  for (const match of content.matchAll(NOSTR_REFERENCE_RE)) {
    const token = match[0];

    if (embeds[token] && !seen.has(token)) {
      seen.add(token);
      references.push(token);
    }
  }

  return references;
}

function cleanUrl(value: string): string {
  return value.replace(/[\].,!?;:]+$/g, '');
}

function urlPath(value: string): string {
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function isImageUrl(value: string): boolean {
  IMAGE_URL_RE.lastIndex = 0;

  return IMAGE_URL_RE.test(value);
}

function isVideoUrl(value: string): boolean {
  const path = urlPath(value);

  return VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isAudioUrl(value: string): boolean {
  const path = urlPath(value);

  return AUDIO_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function attachmentsFromContent(content: string): ContentAttachment[] {
  const seen = new Set<string>();
  const attachments: ContentAttachment[] = [];

  for (const match of content.matchAll(URL_RE)) {
    const url = cleanUrl(match[0]);

    if (seen.has(url)) {
      continue;
    }

    seen.add(url);

    if (isImageUrl(url)) {
      attachments.push({ type: 'image', url });
    } else if (isVideoUrl(url)) {
      attachments.push({ type: 'video', url });
    } else if (isAudioUrl(url)) {
      attachments.push({ type: 'audio', url });
    } else {
      attachments.push({ type: 'link', url });
    }
  }

  return attachments;
}

type ContentPart =
  | { type: 'text'; value: string }
  | { type: 'profile'; value: InlineProfile }
  | { type: 'link'; value: string };

function linkifyTextParts(value: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let cursor = 0;

  for (const match of value.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    const rawUrl = match[0];
    const url = cleanUrl(rawUrl);

    if (index > cursor) {
      parts.push({ type: 'text', value: value.slice(cursor, index) });
    }

    parts.push({ type: 'link', value: url });
    cursor = index + url.length;
  }

  if (cursor < value.length) {
    parts.push({ type: 'text', value: value.slice(cursor) });
  }

  return parts;
}

function visibleContentParts(
  content: string,
  inlineProfiles: Record<string, InlineProfile>,
  embeds: Record<string, WebNostrPostReference>,
): ContentPart[] {
  const parts: ContentPart[] = [];
  let cursor = 0;

  for (const match of content.matchAll(NOSTR_REFERENCE_RE)) {
    const index = match.index ?? 0;
    const token = match[0];

    parts.push(...linkifyTextParts(content.slice(cursor, index)));

    if (inlineProfiles[token]) {
      parts.push({ type: 'profile', value: inlineProfiles[token] });
    } else if (!embeds[token]) {
      parts.push({ type: 'text', value: token });
    }

    cursor = index + token.length;
  }

  parts.push(...linkifyTextParts(content.slice(cursor)));

  return parts.filter(
    (part) => part.type === 'profile' || part.value.length > 0,
  );
}

function InlineContent(props: {
  content: string;
  inlineProfiles: Record<string, InlineProfile>;
  embeds?: Record<string, WebNostrPostReference>;
  runAction: (action: WebAction | undefined) => void;
}): JSX.Element {
  return (
    <For
      each={visibleContentParts(
        props.content,
        props.inlineProfiles,
        props.embeds ?? {},
      )}
    >
      {(part) =>
        part.type === 'profile' ? (
          <button
            type="button"
            class="web-nostrPost__profileMention"
            onClick={() =>
              props.runAction(profileActionForInlineProfile(part.value))
            }
          >
            {inlineProfileLabel(part.value)}
          </button>
        ) : part.type === 'link' ? (
          <a
            class="web-nostrPost__inlineLink"
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part.value}
          </a>
        ) : (
          part.value
        )
      }
    </For>
  );
}

function LinkPreviewCard(props: { url: string }): JSX.Element {
  const [preview, setPreview] = createSignal<
    LinkPreviewResponse['preview'] | null
  >(null);

  const [error, setError] = createSignal<string | null>(null);

  void fetchJson<LinkPreviewResponse>(
    `/api/link-preview?url=${encodeURIComponent(props.url)}`,
  )
    .then((response) => setPreview(response.preview))
    .catch((err) => setError(err instanceof Error ? err.message : String(err)));

  return (
    <Show
      when={preview()}
      fallback={
        <a
          class="web-nostrPost__linkCard"
          href={props.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {error() ? props.url : 'Loading link preview...'}
        </a>
      }
    >
      {(loadedPreview) => (
        <a
          class="web-nostrPost__linkPreview"
          href={loadedPreview().url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Show when={loadedPreview().image}>
            {(image) => <img src={image()} alt="" loading="lazy" />}
          </Show>
          <div class="web-nostrPost__linkPreviewBody">
            <Show when={loadedPreview().siteName}>
              {(siteName) => (
                <div class="web-nostrPost__linkPreviewSite">{siteName()}</div>
              )}
            </Show>
            <div class="web-nostrPost__linkPreviewTitle">
              {loadedPreview().title ?? loadedPreview().url}
            </div>
            <Show when={loadedPreview().description}>
              {(description) => (
                <div class="web-nostrPost__linkPreviewDescription">
                  {description()}
                </div>
              )}
            </Show>
          </div>
        </a>
      )}
    </Show>
  );
}

function AttachmentBlock(props: {
  attachments: ContentAttachment[];
  onOpenImage: OpenImagePreview;
}): JSX.Element {
  const imageUrls = () =>
    props.attachments
      .filter((attachment) => attachment.type === 'image')
      .map((attachment) => attachment.url);

  return (
    <Show when={props.attachments.length > 0}>
      <div class="web-nostrPost__attachments">
        <For each={props.attachments}>
          {(attachment) => (
            <Show
              when={attachment.type === 'image'}
              fallback={
                <Show
                  when={attachment.type === 'video'}
                  fallback={
                    <Show
                      when={attachment.type === 'audio'}
                      fallback={<LinkPreviewCard url={attachment.url} />}
                    >
                      <audio
                        class="web-nostrPost__audio"
                        src={attachment.url}
                        controls
                        preload="metadata"
                      />
                    </Show>
                  }
                >
                  <video
                    class="web-nostrPost__video"
                    src={attachment.url}
                    controls
                    preload="metadata"
                  />
                </Show>
              }
            >
              <ImagePreview
                url={attachment.url}
                onOpen={(url) => props.onOpenImage(url, imageUrls())}
              />
            </Show>
          )}
        </For>
      </div>
    </Show>
  );
}

function ImagePreview(props: {
  url: string;
  onOpen: (url: string) => void;
}): JSX.Element {
  const [loaded, setLoaded] = createSignal(false);

  return (
    <button
      type="button"
      class="web-nostrPost__mediaLink"
      aria-label="Open image preview"
      onClick={() => props.onOpen(props.url)}
    >
      <Show when={!loaded()}>
        <div class="web-nostrPost__mediaLoading">Loading image...</div>
      </Show>
      <img
        classList={{ 'is-loaded': loaded() }}
        src={props.url}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </button>
  );
}

function AttachmentPreview(props: {
  attachments: ContentAttachment[];
  onOpenImage: OpenImagePreview;
  showPreview?: boolean;
  onShowPreviewChange?: (show: boolean) => void;
}): JSX.Element {
  const [localShowPreview, setLocalShowPreview] = createSignal(false);
  const showPreview = () => props.showPreview ?? localShowPreview();

  const togglePreview = () => {
    const next = !showPreview();

    if (props.onShowPreviewChange) {
      props.onShowPreviewChange(next);
    } else {
      setLocalShowPreview(next);
    }
  };

  return (
    <Show when={props.attachments.length > 0}>
      <div class="web-nostrPost__mediaBlock">
        <button
          type="button"
          class="web-nostrPost__action web-nostrPost__mediaToggle"
          onClick={togglePreview}
        >
          {showPreview()
            ? 'Hide preview'
            : `Show preview (${props.attachments.length})`}
        </button>
        <Show when={showPreview()}>
          <AttachmentBlock
            attachments={props.attachments}
            onOpenImage={props.onOpenImage}
          />
        </Show>
      </div>
    </Show>
  );
}

function ImageLightbox(props: {
  url: string | null;
  urls: string[];
  onSelect: (url: string) => void;
  onClose: () => void;
}): JSX.Element {
  const currentIndex = createMemo(() => {
    const url = props.url;

    return url === null ? -1 : props.urls.indexOf(url);
  });

  const hasPrevious = () => currentIndex() > 0;

  const hasNext = () =>
    currentIndex() >= 0 && currentIndex() < props.urls.length - 1;

  const selectOffset = (offset: -1 | 1) => {
    const nextUrl = props.urls[currentIndex() + offset];

    if (nextUrl) {
      props.onSelect(nextUrl);
    }
  };

  return (
    <Show when={props.url}>
      {(url) => (
        <div
          class="web-nostrPost__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={props.onClose}
        >
          <button
            type="button"
            class="web-nostrPost__lightboxClose"
            aria-label="Close"
            onClick={props.onClose}
          >
            ✕
          </button>
          <button
            type="button"
            class="web-nostrPost__lightboxNav web-nostrPost__lightboxNav--previous"
            aria-label="Previous image"
            disabled={!hasPrevious()}
            onClick={(event) => {
              event.stopPropagation();
              selectOffset(-1);
            }}
          >
            {'<'}
          </button>
          <a
            class="web-nostrPost__lightboxImageLink"
            href={url()}
            target="_blank"
            rel="noopener noreferrer"
            title="Open original image"
            onClick={(event) => event.stopPropagation()}
          >
            <img src={url()} alt="" />
          </a>
          <button
            type="button"
            class="web-nostrPost__lightboxNav web-nostrPost__lightboxNav--next"
            aria-label="Next image"
            disabled={!hasNext()}
            onClick={(event) => {
              event.stopPropagation();
              selectOffset(1);
            }}
          >
            {'>'}
          </button>
        </div>
      )}
    </Show>
  );
}

function ActionRow(props: {
  items: PostActionItem[];
  runAction: (action: WebAction | undefined, entityKey?: string | null) => void;
  disabled?: boolean;
  entityKey?: string | null;
}): JSX.Element {
  return (
    <Show when={props.items.length > 0}>
      <div class="web-nostrPost__actions">
        <For each={props.items}>
          {(item, index) => (
            <>
              <Show when={index() > 0}>
                <span class="web-nostrPost__actionSeparator">
                  {item.separatorBefore === 'pipe' ? '|' : '•'}
                </span>
              </Show>
              <button
                type="button"
                class="web-nostrPost__action"
                classList={{
                  'is-success': item.success,
                  'web-nostrPost__action--icon': item.icon !== undefined,
                }}
                aria-label={item.ariaLabel ?? item.label}
                title={item.ariaLabel ?? item.label}
                disabled={item.disabled || props.disabled === true}
                onClick={() =>
                  props.runAction(item.action ?? undefined, props.entityKey)
                }
              >
                {item.icon === 'translate' ? <TranslateIcon /> : item.label}
              </button>
            </>
          )}
        </For>
      </div>
    </Show>
  );
}

function referenceActionItems(
  reference: WebNostrPostReference,
  currentUserPubkey: string | null,
): PostActionItem[] {
  const items: PostActionItem[] = [];

  const flags = getNostrInteractionFlags({
    userPubkey: currentUserPubkey,
    eventId: reference.id,
  });

  const liked = reference.liked === true || flags.liked;
  const replied = reference.replied === true || flags.replied;
  const reposted = reference.reposted === true || flags.reposted;
  const quoted = reference.quoted === true || flags.quoted;

  if (reference.readAction) {
    items.push({
      label: 'Read',
      action: reference.readAction,
      disabled: false,
      success: false,
    });
  }

  if (reference.archiveAction) {
    items.push({
      label: reference.archived === true ? 'Unarchive' : 'Archive',
      action: reference.archiveAction,
      disabled: false,
      success: false,
    });
  }

  if (reference.likeAction) {
    items.push({
      label: liked ? 'Liked' : 'Like',
      action: liked ? null : reference.likeAction,
      disabled: liked,
      success: false,
    });
  }

  if (reference.replyAction) {
    items.push({
      label: replied ? 'Replied' : 'Reply',
      action: reference.replyAction,
      disabled: false,
      success: replied,
    });
  }

  if (reference.repostAction) {
    const label = quoted ? 'Quoted' : reposted ? 'Reposted' : 'Repost';

    items.push({
      label,
      action: reposted || quoted ? null : reference.repostAction,
      disabled: reposted || quoted,
      success: reposted || quoted,
    });
  }

  for (const [index, trailingAction] of (
    reference.trailingActions ?? []
  ).entries()) {
    items.push({
      label: trailingAction.label,
      ariaLabel: trailingAction.ariaLabel,
      icon: trailingAction.icon,
      action: trailingAction.action,
      disabled: trailingAction.disabled === true,
      success: trailingAction.active === true,
      ...(index === 0 ? { separatorBefore: 'pipe' as const } : {}),
    });
  }

  return items;
}

function ReferenceCard(props: {
  reference: WebNostrPostReference;
  runAction: RunPostAction;
  onOpenImage: OpenImagePreview;
  onRetryResolution?: () => void;
  currentUserPubkey: string | null;
  sharePrefixes?: WebNostrPostReference['sharePrefixes'];
  depth?: number;
  visitedIds?: Set<string>;
}): JSX.Element {
  const [referenceOverride, setReferenceOverride] =
    createSignal<WebNostrPostReference | null>(null);

  const [loadedSourceReference, setLoadedSourceReference] =
    createSignal<WebNostrPostReference | null>(null);

  const reference = () => referenceOverride() ?? props.reference;

  const sharePrefixes = () =>
    effectiveSharePrefixes(reference(), props.sharePrefixes);

  const depth = () => props.depth ?? 0;
  const visitedIds = () => props.visitedIds ?? new Set<string>();
  const name = () => referenceDisplayName(reference());

  const attachments = () => attachmentsFromContent(reference().content ?? '');

  const embeddedReferences = () => reference().embeddedReferences ?? [];

  const embeddedReferenceMap = () =>
    Object.fromEntries(
      embeddedReferences().flatMap((reference) =>
        reference.token ? [[reference.token, reference]] : [],
      ),
    );

  const showActions = () => reference().showActions !== false;
  const getEntityPending = useContext(WebPendingEntityContext);

  const referencePending = () => {
    const key = reference().entityKey;

    return key ? getEntityPending(key).pending : false;
  };

  const translation = createPostTranslation({
    runAction: props.runAction,
    entityKey: () => reference().entityKey ?? null,
  });

  const actionItems = createMemo(() =>
    referenceActionItems(reference(), props.currentUserPubkey),
  );

  const headerActionItems = createMemo(() =>
    actionItems().filter((item) => item.icon !== undefined),
  );

  const footerActionItems = createMemo(() =>
    actionItems()
      .filter((item) => item.icon === undefined)
      .map((item, index) =>
        index === 0 ? { ...item, separatorBefore: undefined } : item,
      ),
  );

  const openProfile = () =>
    props.runAction(
      profileActionForReference({
        ...reference(),
        sharePrefixes: sharePrefixes(),
      }),
    );

  const resolutionStatus = () => referenceResolutionStatus(reference());

  const toggleHighlightSource = (sourceReference: WebNostrPostReference) => {
    setLoadedSourceReference((current) => (current ? null : sourceReference));
  };

  const hasUnresolvedNestedReference = () => {
    const current = reference();

    const embeddedIds = new Set(
      (current.embeddedReferences ?? []).flatMap((embedded) =>
        embedded.id ? [embedded.id] : [],
      ),
    );

    return (
      current.type === 'event' &&
      current.content !== undefined &&
      contentEventReferences(current.content).some(
        (embedded) =>
          !embeddedIds.has(embedded.id) && !visitedIds().has(embedded.id),
      )
    );
  };

  const resolveReference = async (): Promise<void> => {
    const current = reference();

    const decoded = current.token
      ? decodeContentEventReference(current.token)
      : null;

    const address = current.type === 'address' ? (current.id ?? null) : null;
    const eventId = address ? null : (current.id ?? decoded?.id ?? null);
    const authorPubkey = current.pubkey ?? decoded?.authorPubkey ?? null;
    const targetKey = eventId ?? address;

    if (
      !targetKey ||
      depth() >= MAX_NESTED_REFERENCE_DEPTH ||
      visitedIds().has(targetKey)
    ) {
      props.onRetryResolution?.();

      return;
    }

    setReferenceOverride({ ...current, resolutionStatus: 'loading' });

    try {
      const response = await resolveThreadContextRequest({
        eventId,
        authorPubkey,
        address,
        targetEvent: null,
        relayHints: [
          ...new Set([
            ...(current.relayHints ?? []),
            ...(decoded?.relayHints ?? []),
          ]),
        ],
        fallbackRelays: [],
        includeDirectReplies: false,
        replyLimit: 1,
        threadContextOnly: true,
        resolutionMode: current.resolutionMode ?? 'persistent',
      });

      setReferenceOverride(
        resolvedReferenceTree({
          reference: current,
          event: response.targetEvent,
          response,
          depth: depth(),
          visitedIds: visitedIds(),
        }),
      );
    } catch {
      setReferenceOverride({ ...current, resolutionStatus: 'error' });
    }
  };

  onMount(() => {
    if (
      reference().resolveOnLoad !== false &&
      (resolutionStatus() !== 'resolved' || hasUnresolvedNestedReference())
    ) {
      void resolveReference();
    }
  });

  const resolutionLabel = () => {
    const status = resolutionStatus();

    if (status === 'unresolved') {
      return 'Referenced post is not loaded.';
    }

    if (status === 'missing') {
      return 'Referenced post not found.';
    }

    if (status === 'error') {
      return 'Could not load referenced post.';
    }

    return 'Waiting to load referenced post...';
  };

  const canResolveReference = () =>
    (resolutionStatus() === 'unresolved' ||
      resolutionStatus() === 'missing' ||
      resolutionStatus() === 'error') &&
    (reference().pubkey !== undefined ||
      (reference().token
        ? sourceEventReference(reference().token!) !== null
        : false) ||
      props.onRetryResolution !== undefined);

  return (
    <Show
      when={resolutionStatus() === 'resolved'}
      fallback={
        <div
          class="web-nostrPost__referenceStatus"
          role="status"
          aria-live="polite"
        >
          <span>{resolutionLabel()}</span>
          <Show when={canResolveReference()}>
            <button
              type="button"
              class="web-nostrPost__action"
              onClick={() => void resolveReference()}
            >
              {resolutionStatus() === 'unresolved'
                ? 'Show referenced post'
                : 'Retry'}
            </button>
          </Show>
        </div>
      }
    >
      <Show
        when={reference().href}
        fallback={
          <article
            class="web-nostrPost web-nostrPost--nested"
            data-nostr-event-id={reference().id}
          >
            <Show when={referencePending() || translation.pending()}>
              <div class="web-nostrPost__pending" aria-hidden="true">
                <span>
                  {translation.pending() ? 'Translating...' : 'Updating...'}
                </span>
              </div>
            </Show>
            <button
              type="button"
              class="web-nostrPost__avatar web-nostrPost__profileButton"
              aria-label={`Open ${name()} profile`}
              onClick={openProfile}
              disabled={!reference().pubkey}
            >
              <Show
                when={reference().authorPicture}
                fallback={initials(name())}
              >
                {(src) => <img src={src()} alt="" />}
              </Show>
            </button>
            <div class="web-nostrPost__main">
              <div class="web-nostrPost__header">
                <div class="web-nostrPost__author">
                  <button
                    type="button"
                    class="web-nostrPost__name web-nostrPost__authorButton"
                    onClick={openProfile}
                    disabled={!reference().pubkey}
                  >
                    {name()}
                  </button>
                </div>
                <div class="web-nostrPost__headerMeta">
                  <For each={headerActionItems()}>
                    {(item) => (
                      <button
                        type="button"
                        class="web-nostrPost__headerAction"
                        aria-label={item.ariaLabel ?? item.label}
                        title={item.ariaLabel ?? item.label}
                        disabled={
                          item.disabled ||
                          referencePending() ||
                          translation.pending()
                        }
                        onClick={() => translation.run(item.action)}
                      >
                        <TranslateIcon />
                      </button>
                    )}
                  </For>
                  <Show when={relativeTime(reference().createdAt, Date.now())}>
                    {(time) => (
                      <time class="web-nostrPost__time">{time()}</time>
                    )}
                  </Show>
                </div>
              </div>
              <Show
                when={reference().kind === 9802}
                fallback={
                  <Show
                    when={
                      reference().kind === undefined ||
                      SUPPORTED_NOSTR_CONTENT_KINDS.has(reference().kind!)
                    }
                    fallback={
                      <Show
                        when={openNostrEventHref(
                          reference(),
                          props.sharePrefixes,
                        )}
                      >
                        {(href) => (
                          <a
                            class="web-nostrPost__replyLink"
                            href={href()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {openNostrEventLabel(reference().kind)}
                          </a>
                        )}
                      </Show>
                    }
                  >
                    <Show when={reference().content} fallback="(empty note)">
                      {(content) => (
                        <div class="web-nostrPost__embedContent">
                          <InlineContent
                            content={content()}
                            inlineProfiles={reference().inlineProfiles ?? {}}
                            embeds={embeddedReferenceMap()}
                            runAction={props.runAction}
                          />
                        </div>
                      )}
                    </Show>
                  </Show>
                }
              >
                <HighlightContent
                  content={reference().content ?? ''}
                  source={reference().source}
                  sharePrefixes={sharePrefixes()}
                  sourceLoaded={loadedSourceReference() !== null}
                  onToggleSource={toggleHighlightSource}
                  runAction={props.runAction}
                />
              </Show>
              <Show when={loadedSourceReference()}>
                {(sourceReference) => (
                  <ReferenceCard
                    reference={sourceReference()}
                    runAction={props.runAction}
                    onOpenImage={props.onOpenImage}
                    currentUserPubkey={props.currentUserPubkey}
                    sharePrefixes={sharePrefixes()}
                    depth={depth() + 1}
                    visitedIds={new Set(visitedIds()).add(reference().id ?? '')}
                  />
                )}
              </Show>
              <PostTranslationPanel translation={translation} />
              <AttachmentPreview
                attachments={attachments()}
                onOpenImage={props.onOpenImage}
              />
              <Show when={embeddedReferences().length > 0}>
                <div class="web-nostrPost__embeds">
                  <For each={embeddedReferences()}>
                    {(embeddedReference) => (
                      <ReferenceCard
                        reference={embeddedReference}
                        runAction={props.runAction}
                        onOpenImage={props.onOpenImage}
                        onRetryResolution={props.onRetryResolution}
                        currentUserPubkey={props.currentUserPubkey}
                        sharePrefixes={sharePrefixes()}
                        depth={depth() + 1}
                        visitedIds={new Set(visitedIds()).add(
                          reference().id ?? '',
                        )}
                      />
                    )}
                  </For>
                </div>
              </Show>
              <Show when={showActions() && footerActionItems().length > 0}>
                <ActionRow
                  items={footerActionItems()}
                  runAction={props.runAction}
                  disabled={referencePending()}
                  entityKey={reference().entityKey}
                />
              </Show>
            </div>
          </article>
        }
      >
        {(href) => (
          <a
            class="web-nostrPost__embed web-nostrPost__embed--link"
            href={href()}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="web-nostrPost__embedTitle">
              {referenceTitle(reference())}
            </div>
            <Show when={referenceSubtitle(reference())}>
              {(subtitle) => (
                <div class="web-nostrPost__embedMeta">{subtitle()}</div>
              )}
            </Show>
            <Show when={reference().content}>
              {(content) => (
                <>
                  <div class="web-nostrPost__embedContent">
                    <InlineContent
                      content={content()}
                      inlineProfiles={reference().inlineProfiles ?? {}}
                      embeds={embeddedReferenceMap()}
                      runAction={props.runAction}
                    />
                  </div>
                  <AttachmentPreview
                    attachments={attachmentsFromContent(content())}
                    onOpenImage={props.onOpenImage}
                  />
                </>
              )}
            </Show>
          </a>
        )}
      </Show>
    </Show>
  );
}

export function WebNostrPostElement(
  props: WebNostrPostElementProps,
): JSX.Element {
  const [nowMs, setNowMs] = createSignal(Date.now());

  const initialReplyContext = props.element.props?.nostrReplyContext ?? [];

  const [showThreadContext, setShowThreadContext] = createSignal(
    props.element.props?.nostrShowReplyContext === true &&
      initialReplyContext.length > 0 &&
      initialReplyContext.every(
        (reference) => referenceResolutionStatus(reference) === 'resolved',
      ),
  );

  const [expanded, setExpanded] = createSignal(
    props.element.props?.nostrInitiallyExpanded === true,
  );

  const [loadedSourceReference, setLoadedSourceReference] =
    createSignal<WebNostrPostReference | null>(null);

  const [showMediaPreview, setShowMediaPreview] = createSignal(false);

  const [lightboxImageUrl, setLightboxImageUrl] = createSignal<string | null>(
    null,
  );

  const [lightboxImageUrls, setLightboxImageUrls] = createSignal<string[]>([]);

  const [replyContextOverrides, setReplyContextOverrides] = createSignal<
    Record<string, WebNostrPostReference>
  >({});

  let contextResolution: Promise<void> | null = null;

  const openLightboxImage: OpenImagePreview = (url, urls) => {
    setLightboxImageUrl(url);
    setLightboxImageUrls(urls);
  };

  const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);

  onCleanup(() => window.clearInterval(interval));

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (lightboxImageUrl() === null) {
        return;
      }

      if (event.key === 'Escape') {
        setLightboxImageUrl(null);
      } else if (event.key === 'ArrowLeft' || event.key === '<') {
        event.preventDefault();
        selectLightboxOffset(-1);
      } else if (event.key === 'ArrowRight' || event.key === '>') {
        event.preventDefault();
        selectLightboxOffset(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  const elementProps = () => props.element.props;

  const translation = createPostTranslation({
    runAction: props.runAction,
    entityKey: () => elementProps()?.entityKey ?? null,
  });

  const currentUserPubkey = useWebCurrentUserPubkey();
  const entityPending = useWebEntityPending();
  const name = () => displayName(elementProps());
  const embeds = () => elementProps()?.nostrEmbeds ?? {};
  const inlineProfiles = () => elementProps()?.nostrInlineProfiles ?? {};
  const content = () => elementProps()?.nostrContent ?? '';

  const collapsedContentChars = () =>
    elementProps()?.nostrCollapsedContentChars ?? 420;

  const isContentCollapsed = () =>
    !expanded() && content().length > collapsedContentChars();

  const visibleContent = () =>
    isContentCollapsed()
      ? `${content().slice(0, collapsedContentChars()).trimEnd()}...`
      : content();

  const contentReferences = () => uniqueContentReferences(content(), embeds());

  const toggleHighlightSource = (sourceReference: WebNostrPostReference) => {
    setLoadedSourceReference((current) => (current ? null : sourceReference));
  };

  const suppliedReplyContext = () => elementProps()?.nostrReplyContext ?? [];

  const replyContext = () =>
    suppliedReplyContext().map((reference) => {
      if (referenceResolutionStatus(reference) === 'resolved') {
        return reference;
      }

      return reference.id
        ? (replyContextOverrides()[reference.id] ?? reference)
        : reference;
    });

  const immediateParent = () => replyContext().at(-1) ?? null;

  const setPendingReferenceStatus = (
    status: Extract<ReferenceResolutionStatus, 'loading' | 'error'>,
  ) => {
    const updates = Object.fromEntries(
      replyContext().flatMap((reference) =>
        reference.id && referenceResolutionStatus(reference) !== 'resolved'
          ? [
              [
                reference.id,
                {
                  ...reference,
                  resolutionStatus: status,
                } satisfies WebNostrPostReference,
              ],
            ]
          : [],
      ),
    );

    setReplyContextOverrides((current) => ({ ...current, ...updates }));
  };

  const resolveThreadContext = (): Promise<void> => {
    if (contextResolution) {
      return contextResolution;
    }

    const unresolved = replyContext().filter(
      (reference) => referenceResolutionStatus(reference) !== 'resolved',
    );

    if (unresolved.length === 0) {
      return Promise.resolve();
    }

    const eventId = elementProps()?.nostrEventId;
    const authorPubkey = elementProps()?.nostrPubkey;

    if (!eventId || !authorPubkey) {
      setPendingReferenceStatus('error');

      return Promise.resolve();
    }

    setPendingReferenceStatus('loading');

    contextResolution = resolveThreadContextRequest({
      eventId,
      authorPubkey,
      address: null,
      targetEvent: null,
      relayHints: elementProps()?.nostrRelayHints ?? [],
      fallbackRelays: [],
      includeDirectReplies: false,
      replyLimit: 1,
      threadContextOnly: true,
      resolutionMode: unresolved[0]?.resolutionMode ?? 'persistent',
    })
      .then((response) => {
        const eventsById = new Map(
          response.graph.events.map((event) => [event.id, event]),
        );

        const edgeRelayHints = new Map(
          response.graph.edges.flatMap((edge) =>
            edge.target.type === 'event'
              ? [[edge.target.eventId, edge.relayHints] as const]
              : [],
          ),
        );

        const missingById = new Map(
          response.graph.missing.flatMap((missing) =>
            missing.edge.target.type === 'event'
              ? [[missing.edge.target.eventId, missing.reason] as const]
              : [],
          ),
        );

        const profilesByPubkey = resolvedAuthorProfiles(response.profileEvents);

        const updates = Object.fromEntries(
          unresolved.flatMap((reference) => {
            if (!reference.id) {
              return [];
            }

            const event = eventsById.get(reference.id);

            if (event) {
              return [
                [
                  reference.id,
                  resolvedReference({
                    reference,
                    event,
                    relayHints: edgeRelayHints.get(reference.id) ?? [],
                    profile: profilesByPubkey.get(event.pubkey) ?? null,
                  }),
                ],
              ];
            }

            return [
              [
                reference.id,
                {
                  ...reference,
                  resolutionStatus:
                    missingById.get(reference.id) === 'missing'
                      ? 'missing'
                      : 'error',
                } satisfies WebNostrPostReference,
              ],
            ];
          }),
        );

        setReplyContextOverrides((current) => ({ ...current, ...updates }));
      })
      .catch(() => {
        setPendingReferenceStatus('error');
      })
      .finally(() => {
        contextResolution = null;
      });

    return contextResolution;
  };

  const toggleThreadContext = () => {
    const next = !showThreadContext();

    setShowThreadContext(next);

    if (next) {
      void resolveThreadContext();
    }
  };

  const showImmediateParent = async (source: HTMLElement): Promise<void> => {
    const parent = immediateParent();

    if (!parent?.id) {
      return;
    }

    setShowThreadContext(true);
    await resolveThreadContext();

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        flashNostrEvent({ source, eventId: parent.id! });
      });
    });
  };

  const attachments = () => [
    ...(elementProps()?.nostrMedia ?? []),
    ...attachmentsFromContent(content()),
  ];

  const selectLightboxOffset = (offset: -1 | 1) => {
    const currentUrl = lightboxImageUrl();

    if (currentUrl === null) {
      return;
    }

    const currentIndex = lightboxImageUrls().indexOf(currentUrl);
    const nextUrl = lightboxImageUrls()[currentIndex + offset];

    if (nextUrl) {
      setLightboxImageUrl(nextUrl);
    }
  };

  const canPreviewImages = () => elementProps()?.nostrPreviewImages !== false;
  const showActions = () => elementProps()?.nostrShowActions !== false;

  const openAuthorProfile = () =>
    props.runAction(profileActionForElement(elementProps()));

  const activityHeaders = () => elementProps()?.nostrActivityHeaders ?? [];

  const openActivityActorProfile = (
    activity: NonNullable<WebNostrPostProps['nostrActivityHeaders']>[number],
  ) => {
    props.runAction(
      profileActionForReference({
        type: 'profile',
        pubkey: activity.actorPubkey,
        npub: activity.actorNpub,
        authorName: activity.actorName,
        authorUsername: activity.actorUsername,
        authorPicture: activity.actorPicture,
        authorAbout: activity.actorAbout,
        relayHints: [],
        profileActions: activity.profileActions,
        profileActionsReadAction: activity.profileActionsReadAction,
      }),
    );
  };

  const actionItems = createMemo<PostActionItem[]>(() => {
    const props = elementProps();
    const items: PostActionItem[] = [];

    const flags = getNostrInteractionFlags({
      userPubkey: currentUserPubkey(),
      eventId: props?.nostrEventId,
    });

    const liked = props?.nostrLiked === true || flags.liked;
    const replied = props?.nostrReplied === true || flags.replied;
    const reposted = props?.nostrReposted === true || flags.reposted;
    const quoted = props?.nostrQuoted === true || flags.quoted;

    if (props?.nostrReadAction) {
      items.push({
        label: 'Read',
        action: props.nostrReadAction,
        disabled: false,
        success: false,
      });
    }

    if (props?.nostrArchiveAction) {
      items.push({
        label: props.nostrArchived === true ? 'Archived' : 'Archive',
        action: props.nostrArchiveAction,
        disabled: false,
        success: props.nostrArchived === true,
      });
    }

    for (const extraAction of props?.nostrExtraActions ?? []) {
      items.push({
        label: extraAction.label,
        ariaLabel: extraAction.ariaLabel,
        icon: extraAction.icon,
        action: extraAction.action,
        disabled: extraAction.disabled === true,
        success: extraAction.active === true,
      });
    }

    if (props?.nostrLikeAction) {
      items.push({
        label: liked
          ? 'Liked'
          : props.nostrLikeCount != null
            ? `Like +${props.nostrLikeCount}`
            : 'Like',
        action: liked ? null : props.nostrLikeAction,
        disabled: liked,
        success: false,
      });
    }

    if (props?.nostrReplyAction) {
      items.push({
        label: replied
          ? 'Replied'
          : props.nostrReplyCount != null
            ? `Reply (${props.nostrReplyCount})`
            : 'Reply',
        action: props.nostrReplyAction,
        disabled: false,
        success: replied,
      });
    }

    if (props?.nostrRepostAction) {
      const label = quoted ? 'Quoted' : reposted ? 'Reposted' : 'Repost';

      items.push({
        label,
        action: reposted || quoted ? null : props.nostrRepostAction,
        disabled: reposted || quoted,
        success: reposted || quoted,
      });
    }

    for (const [index, trailingAction] of (
      props?.nostrTrailingActions ?? []
    ).entries()) {
      items.push({
        label: trailingAction.label,
        ariaLabel: trailingAction.ariaLabel,
        icon: trailingAction.icon,
        action: trailingAction.action,
        disabled: trailingAction.disabled === true,
        success: trailingAction.active === true,
        ...(index === 0 ? { separatorBefore: 'pipe' as const } : {}),
      });
    }

    return items;
  });

  const headerActionItems = createMemo(() =>
    actionItems().filter((item) => item.icon !== undefined),
  );

  const footerActionItems = createMemo(() =>
    actionItems()
      .filter((item) => item.icon === undefined)
      .map((item, index) =>
        index === 0 ? { ...item, separatorBefore: undefined } : item,
      ),
  );

  const runHeaderAction = (item: PostActionItem): void => {
    if (item.icon !== 'translate' || item.action?.type !== 'capability') {
      props.runAction(item.action ?? undefined);

      return;
    }

    translation.run(item.action);
  };

  return (
    <article
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      data-nostr-event-id={elementProps()?.nostrEventId}
      style={elementStyle(props.element)}
      aria-busy={
        entityPending().pending || translation.pending() ? 'true' : undefined
      }
    >
      <Show when={entityPending().pending || translation.pending()}>
        <div class="web-nostrPost__pending" aria-hidden="true">
          <span>
            {translation.pending()
              ? 'Translating...'
              : (entityPending().label ?? 'Updating...')}
          </span>
        </div>
      </Show>
      <For each={activityHeaders()}>
        {(activity) => (
          <div class="web-nostrPost__activityHeader">
            <span>{activity.label} · by </span>
            <button
              type="button"
              class="web-nostrPost__activityActor web-nostrPost__authorButton"
              onClick={() => openActivityActorProfile(activity)}
            >
              @
              {activity.actorUsername ??
                activity.actorName ??
                activity.actorNpub}
            </button>
            <span> · </span>
            <time class="web-nostrPost__time">
              {relativeTime(activity.createdAt, nowMs())}
            </time>
          </div>
        )}
      </For>
      <Show when={replyContext().length > 0}>
        <div class="web-nostrPost__contextBlock">
          <button
            type="button"
            class="web-nostrPost__action web-nostrPost__contextToggle"
            onClick={toggleThreadContext}
          >
            {showThreadContext()
              ? 'Hide thread context'
              : `Show thread context (${replyContext().length})`}
          </button>
          <Show when={showThreadContext()}>
            <div class="web-nostrPost__replyContext">
              <For each={replyContext()}>
                {(reference) => (
                  <ReferenceCard
                    reference={reference}
                    runAction={props.runAction}
                    onOpenImage={openLightboxImage}
                    onRetryResolution={() => void resolveThreadContext()}
                    currentUserPubkey={currentUserPubkey()}
                    sharePrefixes={elementProps()?.nostrSharePrefixes}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
      <div class="web-nostrPost__profileHeader">
        <button
          type="button"
          class="web-nostrPost__avatar web-nostrPost__profileButton"
          aria-label={`Open ${name()} profile`}
          onClick={openAuthorProfile}
          disabled={!elementProps()?.nostrPubkey}
        >
          <Show
            when={elementProps()?.nostrAuthorPicture}
            fallback={initials(name())}
          >
            {(src) => <img src={src()} alt="" />}
          </Show>
        </button>
        <div class="web-nostrPost__header">
          <div class="web-nostrPost__author">
            <button
              type="button"
              class="web-nostrPost__name web-nostrPost__authorButton"
              onClick={openAuthorProfile}
              disabled={!elementProps()?.nostrPubkey}
            >
              {name()}
            </button>
          </div>
          <div class="web-nostrPost__headerMeta">
            <For each={headerActionItems()}>
              {(item) => (
                <button
                  type="button"
                  class="web-nostrPost__headerAction"
                  aria-label={item.ariaLabel ?? item.label}
                  title={item.ariaLabel ?? item.label}
                  disabled={
                    item.disabled ||
                    entityPending().pending ||
                    translation.pending()
                  }
                  onClick={() => runHeaderAction(item)}
                >
                  <TranslateIcon />
                </button>
              )}
            </For>
            <Show when={relativeTime(elementProps()?.nostrCreatedAt, nowMs())}>
              {(time) => <time class="web-nostrPost__time">{time()}</time>}
            </Show>
          </div>
        </div>
      </div>

      <div class="web-nostrPost__main">
        <Show when={immediateParent()}>
          {(parent) => (
            <button
              type="button"
              class="web-nostrPost__replyLink"
              onClick={(event) => void showImmediateParent(event.currentTarget)}
            >
              ↳ replying to {referenceDisplayName(parent())}
              <Show when={relativeTime(parent().createdAt, nowMs())}>
                {(time) => <> · {time()}</>}
              </Show>
            </button>
          )}
        </Show>

        <Show
          when={elementProps()?.nostrKind === 9802}
          fallback={
            <div class="web-nostrPost__body">
              <Show
                when={
                  visibleContentParts(
                    visibleContent(),
                    inlineProfiles(),
                    embeds(),
                  ).length > 0
                }
                fallback={content().length > 0 ? '' : '(empty note)'}
              >
                <InlineContent
                  content={visibleContent()}
                  inlineProfiles={inlineProfiles()}
                  embeds={embeds()}
                  runAction={props.runAction}
                />
              </Show>
              <Show when={isContentCollapsed()}>
                {' '}
                <button
                  type="button"
                  class="web-nostrPost__action web-nostrPost__more"
                  onClick={() => setExpanded(true)}
                >
                  More
                </button>
              </Show>
            </div>
          }
        >
          <HighlightContent
            content={content()}
            source={elementProps()?.nostrSource}
            sharePrefixes={elementProps()?.nostrSharePrefixes}
            sourceLoaded={loadedSourceReference() !== null}
            onToggleSource={toggleHighlightSource}
            runAction={props.runAction}
          />
        </Show>

        <Show when={loadedSourceReference()}>
          {(sourceReference) => (
            <ReferenceCard
              reference={sourceReference()}
              runAction={props.runAction}
              onOpenImage={openLightboxImage}
              currentUserPubkey={currentUserPubkey()}
              sharePrefixes={elementProps()?.nostrSharePrefixes}
            />
          )}
        </Show>

        <PostTranslationPanel translation={translation} />

        <Show when={canPreviewImages()}>
          <AttachmentPreview
            attachments={attachments()}
            onOpenImage={openLightboxImage}
            showPreview={showMediaPreview()}
            onShowPreviewChange={setShowMediaPreview}
          />
        </Show>

        <Show when={contentReferences().length > 0}>
          <div class="web-nostrPost__embeds">
            <For each={contentReferences()}>
              {(token) => (
                <ReferenceCard
                  reference={embeds()[token]!}
                  runAction={props.runAction}
                  onOpenImage={openLightboxImage}
                  currentUserPubkey={currentUserPubkey()}
                  sharePrefixes={elementProps()?.nostrSharePrefixes}
                />
              )}
            </For>
          </div>
        </Show>

        <Show when={showActions() && footerActionItems().length > 0}>
          <ActionRow
            items={footerActionItems()}
            runAction={props.runAction}
            disabled={entityPending().pending}
          />
        </Show>
      </div>
      <ImageLightbox
        url={lightboxImageUrl()}
        urls={lightboxImageUrls()}
        onSelect={setLightboxImageUrl}
        onClose={() => setLightboxImageUrl(null)}
      />
    </article>
  );
}
