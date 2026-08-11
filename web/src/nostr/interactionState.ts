import { createSignal } from 'solid-js';

import type { WebAction } from '@src/web/ui-schema';

export type NostrInteractionKind = 'liked' | 'replied' | 'reposted' | 'quoted';

export type NostrInteractionFlags = Record<NostrInteractionKind, boolean>;

type MarkNostrInteractionProps = {
  userPubkey: string | null;
  eventId: string | null | undefined;
  kind: NostrInteractionKind;
};

export type NostrInteractionRecordResult = {
  type: 'nostrInteractionRecord';
  nrAlias: string;
  targetEventId: string;
  interactionEventId: string;
  userPubkey: string;
  interactionType: NostrInteractionKind;
  interactionCreatedAt: number;
  afterRecordCommands?: Array<Extract<WebAction, { type: 'command' }>>;
};

const EMPTY_FLAGS: NostrInteractionFlags = {
  liked: false,
  replied: false,
  reposted: false,
  quoted: false,
};

const [interactionByKey, setInteractionByKey] = createSignal<
  Record<string, NostrInteractionFlags>
>({});

const [interactionByEventId, setInteractionByEventId] = createSignal<
  Record<string, NostrInteractionFlags>
>({});

function interactionKey(userPubkey: string, eventId: string): string {
  return `${userPubkey}:${eventId}`;
}

export function markNostrInteraction({
  userPubkey,
  eventId,
  kind,
}: MarkNostrInteractionProps): void {
  if (!userPubkey || !eventId) {
    return;
  }

  const key = interactionKey(userPubkey, eventId);

  setInteractionByEventId((current) => ({
    ...current,
    [eventId]: {
      ...(current[eventId] ?? EMPTY_FLAGS),
      [kind]: true,
    },
  }));

  setInteractionByKey((current) => ({
    ...current,
    [key]: {
      ...(current[key] ?? EMPTY_FLAGS),
      [kind]: true,
    },
  }));
}

export function getNostrInteractionFlags({
  userPubkey,
  eventId,
}: {
  userPubkey: string | null;
  eventId: string | null | undefined;
}): NostrInteractionFlags {
  if (!userPubkey || !eventId) {
    return eventId
      ? (interactionByEventId()[eventId] ?? EMPTY_FLAGS)
      : EMPTY_FLAGS;
  }

  return (
    interactionByKey()[interactionKey(userPubkey, eventId)] ??
    interactionByEventId()[eventId] ??
    EMPTY_FLAGS
  );
}
