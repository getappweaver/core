import { nip19, type Event as NostrEvent } from 'nostr-tools';

import { isReplaceableKind, MAX_CACHED_RELAY_HINTS } from './cache/store';
import type {
  EventReferenceEdge,
  EventReferenceRole,
  EventReferenceTarget,
} from './event-resolution-types';
import { uniqueRelays } from './nip65';

const NOSTR_REFERENCE_RE = /\bnostr:([a-z0-9]+)/gi;

type AddReferenceProps = {
  edges: Map<string, EventReferenceEdge>;
  sourceEventId: string;
  role: EventReferenceRole;
  target: EventReferenceTarget | null;
  relayHints: string[];
};

type EventTargetFromTagProps = {
  tag: string[];
  valueIndex: number;
  authorIndex: number;
};

function isHex64(value: string | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function eventTargetFromTag({
  tag,
  valueIndex,
  authorIndex,
}: EventTargetFromTagProps): EventReferenceTarget | null {
  const eventId = tag[valueIndex];

  if (!isHex64(eventId)) {
    return null;
  }

  const author = tag[authorIndex];

  return {
    type: 'event',
    eventId: eventId.toLowerCase(),
    authorPubkey: isHex64(author) ? author.toLowerCase() : null,
  };
}

function addressTarget(value: string | undefined): EventReferenceTarget | null {
  if (!value) {
    return null;
  }

  const firstColon = value.indexOf(':');
  const secondColon = value.indexOf(':', firstColon + 1);

  if (firstColon <= 0 || secondColon <= firstColon + 1) {
    return null;
  }

  const kind = Number.parseInt(value.slice(0, firstColon), 10);
  const pubkey = value.slice(firstColon + 1, secondColon);

  if (
    !Number.isSafeInteger(kind) ||
    !isReplaceableKind(kind) ||
    !isHex64(pubkey)
  ) {
    return null;
  }

  return {
    type: 'address',
    kind,
    pubkey: pubkey.toLowerCase(),
    identifier: value.slice(secondColon + 1),
  };
}

function targetKey(target: EventReferenceTarget): string {
  return target.type === 'event'
    ? `event:${target.eventId}`
    : `address:${target.kind}:${target.pubkey}:${target.identifier}`;
}

function addReference({
  edges,
  sourceEventId,
  role,
  target,
  relayHints,
}: AddReferenceProps): void {
  if (!target) {
    return;
  }

  const key = `${role}:${targetKey(target)}`;
  const existing = edges.get(key);

  if (existing) {
    existing.relayHints = uniqueRelays([
      ...existing.relayHints,
      ...relayHints,
    ]).slice(0, MAX_CACHED_RELAY_HINTS);

    if (
      existing.target.type === 'event' &&
      target.type === 'event' &&
      existing.target.authorPubkey === null &&
      target.authorPubkey !== null
    ) {
      existing.target.authorPubkey = target.authorPubkey;
    }

    return;
  }

  edges.set(key, {
    sourceEventId,
    role,
    target,
    relayHints: uniqueRelays(relayHints).slice(0, MAX_CACHED_RELAY_HINTS),
  });
}

function parseNip10References(
  event: NostrEvent,
  edges: Map<string, EventReferenceEdge>,
): void {
  if (event.kind !== 1) {
    return;
  }

  const eventTags = event.tags.filter((tag) => tag[0] === 'e');

  const markedTags = eventTags.filter(
    (tag) => tag[3] === 'root' || tag[3] === 'reply',
  );

  if (markedTags.length > 0) {
    for (const tag of eventTags) {
      addReference({
        edges,
        sourceEventId: event.id,
        role:
          tag[3] === 'root'
            ? 'thread-root'
            : tag[3] === 'reply'
              ? 'thread-parent'
              : 'embed',
        target: eventTargetFromTag({ tag, valueIndex: 1, authorIndex: 4 }),
        relayHints: tag[2] ? [tag[2]] : [],
      });
    }

    return;
  }

  if (eventTags.length === 1) {
    const tag = eventTags[0]!;

    addReference({
      edges,
      sourceEventId: event.id,
      role: 'thread-parent',
      target: eventTargetFromTag({ tag, valueIndex: 1, authorIndex: 4 }),
      relayHints: tag[2] ? [tag[2]] : [],
    });

    return;
  }

  for (const [index, tag] of eventTags.entries()) {
    const role =
      index === 0
        ? 'thread-root'
        : index === eventTags.length - 1
          ? 'thread-parent'
          : 'embed';

    addReference({
      edges,
      sourceEventId: event.id,
      role,
      target: eventTargetFromTag({ tag, valueIndex: 1, authorIndex: 4 }),
      relayHints: tag[2] ? [tag[2]] : [],
    });
  }
}

function parseNip22References(
  event: NostrEvent,
  edges: Map<string, EventReferenceEdge>,
): void {
  if (event.kind !== 1111) {
    return;
  }

  for (const tag of event.tags) {
    let role: EventReferenceRole | null = null;
    let target: EventReferenceTarget | null = null;

    if (tag[0] === 'E') {
      role = 'thread-root';
      target = eventTargetFromTag({ tag, valueIndex: 1, authorIndex: 3 });
    } else if (tag[0] === 'A') {
      role = 'thread-root';
      target = addressTarget(tag[1]);
    } else if (tag[0] === 'e') {
      role = 'thread-parent';
      target = eventTargetFromTag({ tag, valueIndex: 1, authorIndex: 3 });
    } else if (tag[0] === 'a') {
      role = 'thread-parent';
      target = addressTarget(tag[1]);
    }

    if (role) {
      addReference({
        edges,
        sourceEventId: event.id,
        role,
        target,
        relayHints: tag[2] ? [tag[2]] : [],
      });
    }
  }
}

function parseContentReferences(
  event: NostrEvent,
  edges: Map<string, EventReferenceEdge>,
): void {
  for (const match of event.content.matchAll(NOSTR_REFERENCE_RE)) {
    try {
      const decoded = nip19.decode(match[1]!);
      let target: EventReferenceTarget | null = null;
      let relayHints: string[] = [];

      if (decoded.type === 'note') {
        target = isHex64(decoded.data)
          ? {
              type: 'event',
              eventId: decoded.data.toLowerCase(),
              authorPubkey: null,
            }
          : null;
      } else if (decoded.type === 'nevent') {
        target = isHex64(decoded.data.id)
          ? {
              type: 'event',
              eventId: decoded.data.id.toLowerCase(),
              authorPubkey: isHex64(decoded.data.author)
                ? decoded.data.author.toLowerCase()
                : null,
            }
          : null;

        relayHints = decoded.data.relays ?? [];
      } else if (
        decoded.type === 'naddr' &&
        isReplaceableKind(decoded.data.kind) &&
        isHex64(decoded.data.pubkey)
      ) {
        target = {
          type: 'address',
          kind: decoded.data.kind,
          pubkey: decoded.data.pubkey.toLowerCase(),
          identifier: decoded.data.identifier,
        };

        relayHints = decoded.data.relays ?? [];
      }

      addReference({
        edges,
        sourceEventId: event.id,
        role: 'embed',
        target,
        relayHints,
      });
    } catch {
      continue;
    }
  }
}

function parseQuoteReferences(
  event: NostrEvent,
  edges: Map<string, EventReferenceEdge>,
): void {
  for (const tag of event.tags.filter((candidate) => candidate[0] === 'q')) {
    const target =
      eventTargetFromTag({ tag, valueIndex: 1, authorIndex: 3 }) ??
      addressTarget(tag[1]);

    addReference({
      edges,
      sourceEventId: event.id,
      role: 'embed',
      target,
      relayHints: tag[2] ? [tag[2]] : [],
    });
  }
}

function parseInteractionTarget(
  event: NostrEvent,
  edges: Map<string, EventReferenceEdge>,
): void {
  const role =
    event.kind === 6 || event.kind === 16
      ? 'repost-target'
      : event.kind === 7
        ? 'reaction-target'
        : null;

  if (!role) {
    return;
  }

  const addressTag = [...event.tags].reverse().find((tag) => tag[0] === 'a');
  const eventTag = [...event.tags].reverse().find((tag) => tag[0] === 'e');
  const author = [...event.tags].reverse().find((tag) => tag[0] === 'p')?.[1];
  let target = addressTag ? addressTarget(addressTag[1]) : null;
  let relayHints = addressTag?.[2] ? [addressTag[2]] : [];

  if (!target && eventTag) {
    target = eventTargetFromTag({
      tag: eventTag,
      valueIndex: 1,
      authorIndex: 3,
    });

    relayHints = eventTag[2] ? [eventTag[2]] : [];

    if (
      target?.type === 'event' &&
      target.authorPubkey === null &&
      isHex64(author)
    ) {
      target.authorPubkey = author.toLowerCase();
    }
  }

  if (!target && event.kind === 16) {
    try {
      const embedded = JSON.parse(event.content) as unknown;

      if (
        typeof embedded === 'object' &&
        embedded !== null &&
        'id' in embedded &&
        isHex64(embedded.id as string) &&
        'pubkey' in embedded
      ) {
        target = {
          type: 'event',
          eventId: (embedded.id as string).toLowerCase(),
          authorPubkey: isHex64(embedded.pubkey as string)
            ? (embedded.pubkey as string).toLowerCase()
            : null,
        };
      }
    } catch {
      target = null;
    }
  }

  if (!target) {
    return;
  }

  addReference({
    edges,
    sourceEventId: event.id,
    role,
    target,
    relayHints,
  });
}

export function parseEventReferences(event: NostrEvent): EventReferenceEdge[] {
  const edges = new Map<string, EventReferenceEdge>();

  parseNip10References(event, edges);
  parseNip22References(event, edges);
  parseInteractionTarget(event, edges);
  parseQuoteReferences(event, edges);
  parseContentReferences(event, edges);

  return [...edges.values()];
}
