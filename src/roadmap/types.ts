import type { NostrEvent } from 'nostr-tools';

export type RoadmapTarget = {
  ownerPubkey: string;
  repoId: string;
  relayHints: string[];
};

export type RoadmapSnapshot = {
  events: NostrEvent[];
  relays: string[];
};
