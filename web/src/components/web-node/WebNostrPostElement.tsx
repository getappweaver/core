import type { JSX } from 'solid-js';
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';

import type {
  WebAction,
  WebNostrPostElement as NostrPostElement,
  WebNostrPostProps,
  WebNostrPostReference,
} from '@src/web/ui-schema';

import { getNostrInteractionFlags } from '../../nostr/interactionState';
import {
  buildNostrOpenProfileAction,
  buildNostrProfileActionPayload,
} from '../../nostr/profileAction';
import { fetchJson } from '../../utils';

import { useWebCurrentUserPubkey } from './contexts';
import { elementClass, elementStyle, elementUi } from './element-helpers';

const NOSTR_REFERENCE_RE = /nostr:[a-z0-9]+/gi;

const IMAGE_URL_RE =
  /https?:\/\/[^\s<>()"']+\.(?:avif|gif|jpe?g|png|webp)(?:\?[^\s<>()"']*)?/gi;

const URL_RE = /https?:\/\/[^\s<>()"']+/gi;

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'];

type InlineProfile = NonNullable<
  NonNullable<WebNostrPostProps['nostrInlineProfiles']>
>[string];

type WebNostrPostElementProps = {
  element: NostrPostElement;
  runAction: (action: WebAction | undefined) => void;
};

type PostActionItem = {
  label: string;
  ariaLabel?: string;
  action: WebAction | null;
  disabled: boolean;
  success: boolean;
  separatorBefore?: 'pipe';
};

type ContentAttachment =
  | { type: 'image'; url: string }
  | { type: 'video'; url: string }
  | { type: 'link'; url: string };

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
  onOpenImage: (url: string) => void;
}): JSX.Element {
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
                  fallback={<LinkPreviewCard url={attachment.url} />}
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
              <ImagePreview url={attachment.url} onOpen={props.onOpenImage} />
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
  onOpenImage: (url: string) => void;
}): JSX.Element {
  const [showPreview, setShowPreview] = createSignal(false);

  return (
    <Show when={props.attachments.length > 0}>
      <div class="web-nostrPost__mediaBlock">
        <button
          type="button"
          class="web-nostrPost__action web-nostrPost__mediaToggle"
          onClick={() => setShowPreview((current) => !current)}
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
  onClose: () => void;
}): JSX.Element {
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
        </div>
      )}
    </Show>
  );
}

function ActionRow(props: {
  items: PostActionItem[];
  runAction: (action: WebAction | undefined) => void;
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
                classList={{ 'is-success': item.success }}
                aria-label={item.ariaLabel}
                disabled={item.disabled}
                onClick={() => props.runAction(item.action ?? undefined)}
              >
                {item.label}
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

  return items;
}

function ReferenceCard(props: {
  reference: WebNostrPostReference;
  runAction: (action: WebAction | undefined) => void;
  onOpenImage: (url: string) => void;
  currentUserPubkey: string | null;
}): JSX.Element {
  const name = () => referenceDisplayName(props.reference);

  const attachments = () =>
    attachmentsFromContent(props.reference.content ?? '');

  const embeddedReferences = () => props.reference.embeddedReferences ?? [];

  const embeddedReferenceMap = () =>
    Object.fromEntries(
      embeddedReferences().flatMap((reference) =>
        reference.token ? [[reference.token, reference]] : [],
      ),
    );

  const showActions = () => props.reference.showActions !== false;

  const openProfile = () =>
    props.runAction(profileActionForReference(props.reference));

  return (
    <Show
      when={props.reference.href}
      fallback={
        <article class="web-nostrPost web-nostrPost--nested">
          <button
            type="button"
            class="web-nostrPost__avatar web-nostrPost__profileButton"
            aria-label={`Open ${name()} profile`}
            onClick={openProfile}
            disabled={!props.reference.pubkey}
          >
            <Show
              when={props.reference.authorPicture}
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
                  disabled={!props.reference.pubkey}
                >
                  {name()}
                </button>
              </div>
              <Show when={relativeTime(props.reference.createdAt, Date.now())}>
                {(time) => <time class="web-nostrPost__time">{time()}</time>}
              </Show>
            </div>
            <Show when={props.reference.content} fallback="(empty note)">
              {(content) => (
                <div class="web-nostrPost__embedContent">
                  <InlineContent
                    content={content()}
                    inlineProfiles={props.reference.inlineProfiles ?? {}}
                    embeds={embeddedReferenceMap()}
                    runAction={props.runAction}
                  />
                </div>
              )}
            </Show>
            <AttachmentPreview
              attachments={attachments()}
              onOpenImage={props.onOpenImage}
            />
            <Show when={embeddedReferences().length > 0}>
              <div class="web-nostrPost__embeds">
                <For each={embeddedReferences()}>
                  {(reference) => (
                    <ReferenceCard
                      reference={reference}
                      runAction={props.runAction}
                      onOpenImage={props.onOpenImage}
                      currentUserPubkey={props.currentUserPubkey}
                    />
                  )}
                </For>
              </div>
            </Show>
            <Show when={showActions()}>
              <ActionRow
                items={referenceActionItems(
                  props.reference,
                  props.currentUserPubkey,
                )}
                runAction={props.runAction}
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
            {referenceTitle(props.reference)}
          </div>
          <Show when={referenceSubtitle(props.reference)}>
            {(subtitle) => (
              <div class="web-nostrPost__embedMeta">{subtitle()}</div>
            )}
          </Show>
          <Show when={props.reference.content}>
            {(content) => (
              <>
                <div class="web-nostrPost__embedContent">
                  <InlineContent
                    content={content()}
                    inlineProfiles={props.reference.inlineProfiles ?? {}}
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
  );
}

export function WebNostrPostElement(
  props: WebNostrPostElementProps,
): JSX.Element {
  const [nowMs, setNowMs] = createSignal(Date.now());

  const [showThreadContext, setShowThreadContext] = createSignal(
    props.element.props?.nostrShowReplyContext === true,
  );

  const [expanded, setExpanded] = createSignal(
    props.element.props?.nostrInitiallyExpanded === true,
  );

  const [lightboxImageUrl, setLightboxImageUrl] = createSignal<string | null>(
    null,
  );

  const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);

  onCleanup(() => window.clearInterval(interval));

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && lightboxImageUrl() !== null) {
        setLightboxImageUrl(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  const elementProps = () => props.element.props;
  const currentUserPubkey = useWebCurrentUserPubkey();
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
  const replyContext = () => elementProps()?.nostrReplyContext ?? [];

  const attachments = () => [
    ...(elementProps()?.nostrMedia ?? []),
    ...attachmentsFromContent(content()),
  ];

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
        action: trailingAction.action,
        disabled: trailingAction.disabled === true,
        success: trailingAction.active === true,
        ...(index === 0 ? { separatorBefore: 'pipe' as const } : {}),
      });
    }

    return items;
  });

  return (
    <article
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
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
          <Show when={relativeTime(elementProps()?.nostrCreatedAt, nowMs())}>
            {(time) => <time class="web-nostrPost__time">{time()}</time>}
          </Show>
        </div>
      </div>

      <div class="web-nostrPost__main">
        <Show when={replyContext().length > 0}>
          <div class="web-nostrPost__contextBlock">
            <button
              type="button"
              class="web-nostrPost__action web-nostrPost__contextToggle"
              onClick={() => setShowThreadContext((current) => !current)}
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
                      onOpenImage={setLightboxImageUrl}
                      currentUserPubkey={currentUserPubkey()}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        <div class="web-nostrPost__body">
          <Show
            when={
              visibleContentParts(visibleContent(), inlineProfiles(), embeds())
                .length > 0
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

        <Show when={canPreviewImages()}>
          <AttachmentPreview
            attachments={attachments()}
            onOpenImage={setLightboxImageUrl}
          />
        </Show>

        <Show when={contentReferences().length > 0}>
          <div class="web-nostrPost__embeds">
            <For each={contentReferences()}>
              {(token) => (
                <ReferenceCard
                  reference={embeds()[token]!}
                  runAction={props.runAction}
                  onOpenImage={setLightboxImageUrl}
                  currentUserPubkey={currentUserPubkey()}
                />
              )}
            </For>
          </div>
        </Show>

        <Show when={showActions() && actionItems().length > 0}>
          <ActionRow items={actionItems()} runAction={props.runAction} />
        </Show>
      </div>
      <ImageLightbox
        url={lightboxImageUrl()}
        onClose={() => setLightboxImageUrl(null)}
      />
    </article>
  );
}
